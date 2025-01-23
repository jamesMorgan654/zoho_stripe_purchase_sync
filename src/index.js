import { redirectToAuthorization, handleCallback } from './generate-zoho-access-token.js';
import { readWebhook } from './stripe.js';
import { pushToZoho } from './zoho.js';

export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
  
      // Check if running in the Wrangler development environment
      const isLocal = env.WRANGLER_DEV === 'true';
      const zohoZone = env.ZOHO_ZONE;
      const defaultCurrency = env.DEFAULT_CURRENCY;
      const zohoTaxName = env.ZOHO_TAX_NAME;
      const zohoTaxInclusive = env.TAX_INCLUSIVE === 'true';
      const clientId = await env.KV.get("ZOHO_CLIENT_ID");
      if (!clientId) {
        console.log("Zoho client id not found");
        return new Response('Environment details not found', { status: 400 });
      }
      const clientSecret = await env.KV.get("ZOHO_CLIENT_SECRET");
      if (!clientSecret) {
        console.log("Zoho client secret not found");
        return new Response('Environment details not found', { status: 400 });
      }
      const redirect_uri = 'http://127.0.0.1:5000/callback'
  
      // Restrict access to certain routes to local development only
      if (!isLocal && (url.pathname === '/get-access-token' || url.pathname === '/callback')) {
        return new Response('Not Found', { status: 404 });
      }
  
      if (url.pathname === '/get-access-token') {
        return redirectToAuthorization(env, clientId, redirect_uri, zohoZone);
      } else if (url.pathname === '/callback') {
        return handleCallback(url, env, clientId, clientSecret, redirect_uri, zohoZone);
      } else if (url.pathname === '/' && request.method === "POST") {
        // First get the request body and make sure its the right event
        const rawPayload = await request.text();
        const requestBody = JSON.parse(rawPayload);
        const requestBodyType = requestBody.type;
        if (requestBodyType !== "checkout.session.completed") {
            console.log("Wrong event type");
            return new Response('Wrong event type', { status: 202 });
        }
        // Loading necessary env vars and headers
        const stripeAccountId = await env.KV.get("STRIPE_ACCOUNT_ID");
        // Getting the different webhooks and keys by different stripe accounts.
        const stripeWebhookSecret = await env.KV.get("STRIPE_WEBHOOK_KEY");
        if (!stripeWebhookSecret) {
          console.log("Stripe webhook secret not found");
          return new Response('Environment details not found', { status: 400 });
        }
        const stripeKey = await env.KV.get("STRIPE_SECRET_KEY"); 
        if (!stripeKey) {
          console.log("Stripe key not found");
          return new Response('Environment details not found', { status: 400 });
        }
        // Get the stripe signature header
        const stripeSignature = request.headers.get("stripe-signature");
        if (!stripeSignature) {
            return new Response('Stripe signature missing or invalid', { status: 400 });
        }
        const transactionDetails = await readWebhook(stripeSignature, stripeKey, stripeWebhookSecret, rawPayload, defaultCurrency, stripeAccountId)
        if (transactionDetails) {
          const zohoDepositTo = env.DEPOSIT_TO;
          const zohoMode = env.MODE;
          const zohoRefreshToken = await env.KV.get("ZOHO_REFRESH_TOKEN");
          if (!zohoRefreshToken) {
            console.log("Zoho refresh Token not found");
            return new Response('Environment details not found', { status: 400 });
          }
          const zohoOrgId = await env.KV.get("ZOHO_ORG_ID"); 
          if (!zohoOrgId) {
            console.log("Zoho Org id not found");
            return new Response('Environment details not found', { status: 400 });
          }
          const successfullyPushed = await pushToZoho(clientId, clientSecret, zohoRefreshToken, zohoOrgId, transactionDetails, zohoDepositTo, zohoMode, zohoZone, zohoTaxName, zohoTaxInclusive);
          if (successfullyPushed) {
            return new Response("Successful", { status: 200 });
          } else {
            console.log("Error pushing to Zoho");
            return new Response("Error pushing to Zoho", { status: 500 });
          }
        } else {
          console.log("Error getting transaction details");
          return new Response("Error processing data", { status: 500 });
        }
      } else {
        return new Response('Not Found', { status: 404 });
      }
    },
  };
  
  