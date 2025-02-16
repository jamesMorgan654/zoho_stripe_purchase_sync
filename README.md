# Sync Stripe ecommerce payments with Zoho Books using a CloudFlare Worker

This is a cloudflare worker to listen for a webhook from stripe payments, then forwarding the data onto zoho books.  It is a fairly simple setup and can be scaled across any account.  

# Requirements
1. Cloudflare wrangler CLI
2. Zoho Account

# Getting Started

## Setting Cloudflare Account ID
It is necessary to get your Cloudflare account Id and add to the wrangler.toml

## Getting Zoho Access Token & Setting KV
When run locally there are two other endpoints within this application, /get-access-token and /callback. They can be used to generate and show the Zoho access token with relevant scopes for this application. You must complete the following steps to run.

1. Get Secrets - First you must visit https://api-console.zoho.com (or your relevant Zoho region) and create a new application.  Select Server-based Applications and enter;
    - Homepage URL: http://127.0.0.1:5000
    - Authorized Redirect URIs: http://127.0.0.1:5000/callback
2. Create a Cloudflare KV object and enter the details.  Don't forget to map to your wrangler.toml.
```bash
ZOHO_CLIENT_ID=your-client-id
ZOHO_CLIENT_SECRET=your-client-secret
```
3. Run your wrangler in dev mode (note the port.  If 5000 is not available, then you need to adjust the URLs in the Zoho Console as well as in the index.js file.)
```bash
wrangler dev --env dev --port 5000
```
Visit http://127.0.0.1:5000/get-access-token/ and follow the auth flow.
4. Note down the refresh_token and save as a cloudflare KV.
```bash
ZOHO_REFRESH_TOKEN=your-refresh-token
```

5. Note the KV id and add to the wrangler.toml file as the ZOHO binding id.

## Enter the rest of your KVs
- STRIPE_SECRET_KEY (get this from [stripe](https://dashboard.stripe.com/apikeys) )
- STRIPE_ACCOUNT_ID (get this from [stripe](https://dashboard.stripe.com/settings/account))
- STRIPE_WEBHOOK_KEY (set as xxx for now as a placeholder)
- ZOHO_ORG_ID (Get this from your your Zoho Books -> Settings -> Organisation)

## Adjust your Wrangler.toml file 
- Change account id.
- Change KV bindings.  
- You can also adjust vars if you see fit.

## Deploy Wrangler
```bash
npx wrangler deploy --env production
```

## Set up Webhook
1. Add your CloudFlare worker url to your Stripe Webhook with event = checkout.session.completed
2. Get your webhook secret and change the KV value in Cloudflare.
