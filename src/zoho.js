
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
When creating an invoice you need to get the zoho currency id
This fetches a list of the ids and corresponding currency codes.
It assumes that there is only one matching currency code in the list.
*/
async function getCurrencyId(currencyCode, zohoOrgId, zohoAccessToken, zohoZone){
    let options = {
        method: 'GET',
        headers: {
            Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
        }
    };
    let url = `https://www.zohoapis${zohoZone}/books/v3/settings/currencies?organization_id=${encodeURIComponent(zohoOrgId)}`
    let response = await fetch(url, options);
    let responseData = await response.json();
    // Find the matching entry
    const matchingEntry = responseData.currencies.find(
      (currency) => currency.currency_code === currencyCode
    );
    if (matchingEntry) {
      return matchingEntry.currency_id; // Return existing currency ID
    }
    // Return false if there is no currency
    return false
}
/*
When creating an invoice you ideally need the zoho tax id
This fetches a list of all the ids and corresponding "Tax names (What you call them in Zoho)"
It matches with the one you set in the wrangler environment variables and returns the id.
*/
async function getTaxId(zohoTaxName, zohoOrgId, zohoAccessToken, zohoZone) {
    let options = {
        method: 'GET',
        headers: {
            Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
        }
    };
    let url = `https://www.zohoapis${zohoZone}/books/v3/settings/taxes?organization_id=${encodeURIComponent(zohoOrgId)}`
    let response = await fetch(url, options);
    let responseData = await response.json();
    // Find the matching entry
    const matchingEntry = responseData.taxes.find(
      (tax) => tax.tax_name === zohoTaxName
    );
    if (matchingEntry) {
      return matchingEntry.tax_id; // Return existing tax ID
    }
    // Return false if there is no tax
    return false
}
/*
Each invoice needs line items.
This looks for a line item by name, and creates a new one if it cannot find one.
It then returns the item_id.
*******
Note: that this will bundle all items under "Stripe Clearing".  It's does not break down the different SKU's that Stripe may have. 
The expectation is that this reporting would still happen in Stripe.
*/
async function getItemId(zohoOrgId, zohoAccessToken, zohoZone){
    let zohoItemName = "Stripe Clearing";
    let options = {
          method: 'GET',
          headers: {
              Authorization: `Zoho-oauthtoken ${zohoAccessToken}`
          }
    };
    let url = `https://www.zohoapis${zohoZone}/books/v3/items?organization_id=${encodeURIComponent(zohoOrgId)}&name_contains=Stripe`
    let response = await fetch(url, options);
    let responseData = await response.json();
    // Find the matching entry
    const matchingEntry = responseData.items.find(
      (items) => items.name === zohoItemName
    );
    if (matchingEntry) {
      return matchingEntry.tax_id; // Return existing tax ID
    }
    // Item does not exist, creating one.
    const body = {
      name: zohoItemName,
      rate: 1
    }
    options = {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    };
    url = `https://www.zohoapis${zohoZone}/books/v3/items?organization_id=${encodeURIComponent(zohoOrgId)}`;
    response = await fetch(url, options);
    responseData = await response.json();
    if (response.ok) {
      let responseData = await response.json();
      return responseData.item.item_id;
    }
    throw new Error("Failed to create item in Zoho.");
}
/*
Each payment needs to be put against an invoice to be recognised as revenue.
This creates an invoice with the same reference as the stripe checkout session.
It then returns the Zoho invoice id for the purchase to be assigned against.
*/
async function createZohoInvoice(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName, zohoTaxName, zohoTaxInclusive){
  const currencyCode = transactionDetails.currency;
  const currencyId = await getCurrencyId(currencyCode, zohoOrgId, zohoAccessToken, zohoZone);
  const taxId = await getTaxId(zohoTaxName, zohoOrgId, zohoAccessToken, zohoZone);
  const itemId = await getItemId(zohoOrgId, zohoAccessToken, zohoZone);
  let body = {
    customer_id: customerId,
    invoice_number: transactionDetails.transactionId, 
    reference_number: transactionDetails.transactionId,
    date: transactionDetails.transactionDate, 
    line_items: [
      {
        item_id: itemId,
        description: "Stripe Clearing",
        rate: transactionDetails.amount,
        quantity: 1,
        tax_id: taxId
      }
    ],
    is_inclusive_tax: zohoTaxInclusive //Fixed for now based on wrangler var.
  };
  // Add in currency and tax if available
  if (currencyId) {
    body.currency_id = currencyId;
  }
  if (taxId) {
    body.taxId = taxId;
  }
  const options = {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${zohoAccessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
  const url = `https://www.zohoapis${zohoZone}/books/v3/invoices?organization_id=${encodeURIComponent(zohoOrgId)}&send=false&ignore_auto_number_generation=true`; // not sending
  let response = await fetch(url, options);
  if (response.ok) {
    let responseData = await response.json();
    return responseData.invoice.invoice_id;
  }
  throw new Error("Failed to create invoice in Zoho.");
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
    let body = {
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
async function createZohoPayment(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName, zohoTaxName, zohoTaxInclusive) {
    const bankAccountId = await getBankAccountId(zohoOrgId, zohoAccessToken, zohoZone, zohoDepositTo);
    const invoiceId =  await createZohoInvoice(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName, zohoTaxName, zohoTaxInclusive);
    // Prepare the payload
    let body = {
        customer_id: customerId,
        payment_mode: zohoMode,
        amount: transactionDetails.amount, 
        date: transactionDetails.transactionDate, 
        reference_number: transactionDetails.transactionId, 
        description: transactionDetails.description,
        invoices: [
          {
            invoice_id: invoiceId,
            amount_applied: transactionDetails.amount
          }
        ],
        invoice_id: invoiceId,
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
        // const responseData = await response.json();
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
async function pushToZoho(clientId, clientSecret, zohoRefreshToken, zohoOrgId, transactionDetails, zohoDepositTo, zohoMode, zohoZone, zohoTaxName, zohoTaxInclusive) {
    const zohoAccessToken = await refreshZohoAccessToken(clientId, clientSecret, zohoRefreshToken, zohoZone);
    const customerName = `Stripe: ${transactionDetails['stripeAccountName']}`;
    // Check or create the customer
    const customerId = await ensureCustomerExists(zohoOrgId, zohoAccessToken, customerName, zohoZone);
    // Get the next payment number
    const paymentNumber = await getNextPaymentNumber(zohoOrgId, zohoAccessToken, zohoZone);
    transactionDetails = transactionDetails.transactionDetails;
    // Push payment to Zoho Books
    if (await createZohoPayment(transactionDetails, zohoOrgId, zohoAccessToken, customerId, zohoZone, paymentNumber, zohoMode, zohoDepositTo, customerName, zohoTaxName, zohoTaxInclusive)) {
        return true;
    }
}

export { pushToZoho };