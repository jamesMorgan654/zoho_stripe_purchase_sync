
/*
Zoho refresh token need to be used to generate a short term access token.
Requests the accounts api with the client id and secret.
*/
async function refreshZohoAccessToken(clientId, clientSecret, zohoRefreshToken, zohoZone) {
    const url = `https://accounts.zoho${zohoZone}/oauth/v2/token`;
    const refreshUrl = `${url}?refresh_token=${zohoRefreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  
    const data = await response.json();
  
    if (response.ok) {
      return data.access_token; // Return the new access token
    } else {
      throw new Error(`Failed to refresh access token: ${data.error}`);
    }
  }
/*
The transaction needs to be assigned to a customer.
This checks to see if the generic Stripe customer name exists. 
If it doesn't it creates a new customer.
Returns customer id either way.
*************
Note: This has been specifically built to bundle all under a "Stripe" customer instead of referencing the actual customer.
Reason for this is because we felt it unnecessary to pull all the way to Zoho, and Stripe can still be used for customer analytics. 
*/
async function ensureCustomerExists(zohoOrgId, zohoAccessToken, customerName, zohoZone) {
    // Check if customer exists
    let options = {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
        }
      };
    let url = `https://www.zohoapis${zohoZone}/books/v3/contacts?organization_id=${encodeURIComponent(zohoOrgId)}&contact_name_contains=${customerName}&status=active`;
    const searchResponse = await fetch(url, options)
    const searchData = await searchResponse.json();
    if (searchData && searchData.contacts && searchData.contacts.length > 0) {
        return searchData.contacts[0].contact_id; // Return existing customer ID
    }
    // If customer does not exist then create a new one
    options = {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
            contact_name: customerName,
        }),
      };
    url = `https://www.zohoapis${zohoZone}/books/v3/contacts?organization_id=${encodeURIComponent(zohoOrgId)}`;
    const createResponse = await fetch(url, options)
    const createData = await createResponse.json();
    if (createData && createData.contact) {
        return createData.contact.contact_id; // Return new customer ID
    }

    throw new Error("Failed to ensure customer exists in Zoho.");
}
/*
Payment number also needs to be referenced with the transaction.  This finds the latest / largest one then adds one to it.
There cannot be duplicates.
*/
async function getNextPaymentNumber(zohoOrgId, zohoAccessToken, zohoZone) {
    // Fetch the latest payment record
    const options = {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
        }
      };
    const url = `https://www.zohoapis${zohoZone}/books/v3/customerpayments?organization_id=${encodeURIComponent(zohoOrgId)}&sort_column=payment_number&sort_order=D`;
    const response = await fetch(url, options);
    
    const data = await response.json();

    if (data && data.customerpayments && data.customerpayments.length > 0) {
        const latestPayment = data.customerpayments[0].payment_number;
        return parseInt(latestPayment, 10) + 1; // Increment latest payment number
    }

    // Default to 1 if no payments exist
    return 1;
}

/*
Gets the bank account id for Stripe Clearing
Ideally you need to specify the bank account number that the payment is being deposited to.
That way you can easily clear all the payments at the end of the month / reporting period you use.
*/
async function getBankAccountId(zohoOrgId, zohoAccessToken, zohoZone, zohoDepositTo) {
    let options = {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
        }
    };
    let url = `https://www.zohoapis${zohoZone}/books/v3/bankaccounts?organization_id=${encodeURIComponent(zohoOrgId)}`
    let response = await fetch(url, options);
    let responseData = await response.json();
    // Find the matching entry
    const matchingEntry = responseData.bankaccounts.find(
        (account) => account.account_name === zohoDepositTo
    );
    if (matchingEntry) {
        return matchingEntry.account_id; // Return existing account ID
    }

    // Bank account not found, creating one.
    const body = {
        account_name: zohoDepositTo,
        account_type: "bank",
        description: "Stripe Clearing Account"
    }
    options = {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    };
    url = `https://www.zohoapis${zohoZone}/books/v3/bankaccounts?organization_id=${encodeURIComponent(zohoOrgId)}`
    response = await fetch(url, options);
    responseData = await response.json();
    return responseData.bankaccount.account_id
}
/*
Records the payment in Zoho.
This is done by first looking up the retainer invoice id (All payments need to be assigned to an invoice)
Then assigning an advance payment against this invoice.
Basic use but this is designed to sync payments into Zoho, not the context.  Detailed reporting is to be done in Stripe.
*/
async function createZohoPayment(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName) {
    const bankAccountId = await getBankAccountId(zohoOrgId, zohoAccessToken, zohoZone, zohoDepositTo);
    // Prepare the payload
    const body = {
        customer_id: customerId,
        payment_mode: zohoMode,
        amount: transactionDetails.amount, 
        date: transactionDetails.transactionDate, 
        reference_number: transactionDetails.transactionId, 
        description: transactionDetails.description,
        currency_code: transactionDetails.currency, 
        amount_applied: transactionDetails.amount,
        // payment_number: paymentNumber.toString(),
        account_id: bankAccountId
    };
    const options = {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    };
    const url = `https://www.zohoapis${zohoZone}/books/v3/customerpayments?organization_id=${encodeURIComponent(zohoOrgId)}`
    const response = await fetch(url, options);
    if (response.ok) {
        const responseData = await response.json();
        return true
    }
    // Logging for errors.
    console.log(response);
    console.log(await response.json());
    // Throw error if the payment failed to update 
    throw new Error("Failed to create payment in Zoho.");
}
/*
Function to coordinate everything in Zoho.  
First it gets the access token before then getting additional context required for the transaction.
Lastly pushes the transaction data. 
*/
async function pushToZoho(clientId, clientSecret, zohoRefreshToken, zohoOrgId, transactionDetails, zohoDepositTo, zohoMode, zohoZone) {
    const zohoAccessToken = await refreshZohoAccessToken(clientId, clientSecret, zohoRefreshToken, zohoZone);
    const customerName = `Stripe: ${transactionDetails['stripeAccountName']}`;
    // Check or create the customer
    const customerId = await ensureCustomerExists(zohoOrgId, zohoAccessToken, customerName, zohoZone);
    // Get the next payment number
    const paymentNumber = await getNextPaymentNumber(zohoOrgId, zohoAccessToken, zohoZone);
    transactionDetails = transactionDetails.transactionDetails;
    // Push payment to Zoho Books
    if (await createZohoPayment(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName)) {
        return true;
    }
}

export { pushToZoho };