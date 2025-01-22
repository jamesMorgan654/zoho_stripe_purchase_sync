/**
 * Redirect the user to the Zoho authorization URL.
 */
function redirectToAuthorization(env, clientId, redirect_uri, zohoZone) {
    const scopes = [
        'ZohoBooks.fullaccess.all', // Full access to all modules (if needed)
        'ZohoBooks.payments.CREATE', // Create payments
        'ZohoBooks.payments.READ',   // Read payment details
        'ZohoBooks.contacts.CREATE', // Create customers
        'ZohoBooks.contacts.READ',   // Read customer details
        'ZohoBooks.contacts.UPDATE',  // Update customer details
        'ZohoBooks.banking.CREATE',  // Create bank accounts
        'ZohoBooks.banking.UPDATE',  // Update bank accounts
        'ZohoBooks.banking.READ'     // Read bank account details
    ].join(' ');
    const authorizationUrl = `https://accounts.zoho${zohoZone}/oauth/v2/auth?scope=${encodeURIComponent(
        scopes
    )}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${encodeURIComponent(
        redirect_uri
    )}`;

    return Response.redirect(authorizationUrl, 302);
}

/**
 * Handle the callback from Zoho and exchange the code for tokens.
 */
async function handleCallback(url, env, clientId, clientSecret, redirect_uri, zohoZone) {
    const code = url.searchParams.get('code');
    if (!code) {
        return new Response('No authorization code received.', { status: 400 });
    }

    const tokenEndpoint = `https://accounts.zoho${zohoZone}/oauth/v2/token`;
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect_uri,
        code,
    });

    try {
        const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        });

        if (!response.ok) {
        return new Response(
            `Failed to exchange code for tokens: ${await response.text()}`,
            { status: response.status }
        );
        }

        const tokens = await response.json();
        return new Response(JSON.stringify(tokens, null, 2), {
        headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        return new Response(`Error: ${err.message}`, { status: 500 });
    }
}

export { redirectToAuthorization, handleCallback };