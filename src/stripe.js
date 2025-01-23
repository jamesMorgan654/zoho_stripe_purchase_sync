import Stripe from 'stripe';

async function validateStripeSignature(stripe, stripeSignature, stripeWebhookSecret, rawPayload) {
    
    try {
        const event = await stripe.webhooks.constructEventAsync(rawPayload, stripeSignature, stripeWebhookSecret);
        return event;
    } catch (error) {
        // If the signatures don't match, an error will be thrown
        if (error instanceof stripe.errors.StripeSignatureVerificationError) {
          console.error("Signature verification failed:", error.message);
        } else {
          console.error("Unexpected error:", error.message);
        }
        return new Response('Invalid Stripe signature', { status: 400 });
      }
}

// Helper to extract transaction details
function extractTransactionDetails(event, defaultCurrency) {
    /*
    Assumes that all of the required details are there in the rawPayload object from the webhook
    */
    if (event.type === 'checkout.session.completed') {
        const checkoutSession = event.data.object;
        // Convert the created timestamp to NZT
        const transactionDate = new Date(checkoutSession.created * 1000); // Convert Unix timestamp to milliseconds
        const options = {
            timeZone: 'Pacific/Auckland',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        };
        const transactionDateNZT = new Intl.DateTimeFormat('en-NZ', options).format(transactionDate);
        // Split the formatted string and rearrange it to yyyy-mm-dd
        const [day, month, year] = transactionDateNZT.split('/');
        const formattedDate = `${year}-${month}-${day}`;
        // Calculating the amount based on fx in payload
        const amount = checkoutSession.amount_total; // In cents
        const fx = parseFloat(checkoutSession.currency_conversion?.fx_rate || "1"); // Default fx_rate to 1 if missing
        const currency = checkoutSession.currency_conversion?.source_currency?.toUpperCase() || defaultCurrency;

        if (!fx || fx <= 0) {
            throw new Error("Invalid or missing fx_rate in currency_conversion");
        }

        const localAmount = (amount / fx) / 100; // Convert cents to dollars and apply conversion

        return {
            transactionId: checkoutSession.payment_intent,
            amount: parseFloat(localAmount.toFixed(2)), // Convert cents to dollars
            currency: currency,
            description: checkoutSession.description || 'No description provided',
            status: checkoutSession.status,
            transactionDate: formattedDate,
        };
    }

    // Handle other event types as needed
    return new Response('Wrong event type', { status: 202 });
}

async function readWebhook(stripeSignature, stripeKey, stripeWebhookSecret, rawPayload, defaultCurrency, stripeAccountId = false) {
    /*
    Uses the Stripe API to fetch the transaction details that come from a stripe webhook.
    It uses the signature to verify the webhook and then fetches the transaction details.
    */
    const stripe = new Stripe(stripeKey);
    const event = await validateStripeSignature(stripe, stripeSignature, stripeWebhookSecret, rawPayload);
    // If the signature validation failed, return an error response
    if (!event) {
        return new Response('Invalid Stripe signature', { status: 400 });
    }
    let stripeAccountName = 'Unknown Stripe Account';
    if (stripeAccountId) {
        try {
            // Fetch account details using the account header
            const accountDetails = await stripe.accounts.retrieve(stripeAccountId);
            stripeAccountName = accountDetails.business_profile.name || accountDetails.email || stripeAccountId;
        } catch (error) {
            console.error('Error retrieving Stripe account details:', error.message);
            // Keep the name as 'Unknown Stripe Account' if API call fails
        }
    }
    const transactionDetails = extractTransactionDetails(event, defaultCurrency);
    return {
        stripeAccountName,
        transactionDetails
    }
}

export { readWebhook };