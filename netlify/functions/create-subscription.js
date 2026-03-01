// netlify/functions/create-subscription.js
// Creates a PayPal subscription and redirects user to approve it

exports.handler = async (event) => {
  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
  const BASE_URL = process.env.URL || 'https://your-site.netlify.app';

  const params = event.queryStringParameters || {};
  const { plan, userId, planId } = params;

  if (!plan || !userId || !planId) {
    return { statusCode: 400, body: 'Missing parameters' };
  }

  try {
    // Get PayPal access token
    const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) throw new Error('Failed to get PayPal token');

    // Create subscription
    const subRes = await fetch('https://api-m.paypal.com/v1/billing/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: userId,
        application_context: {
          brand_name: 'EMBER Menu Intelligence',
          locale: 'en-GB',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${BASE_URL}/.netlify/functions/subscription-success?plan=${plan}&userId=${userId}`,
          cancel_url: `${BASE_URL}/?cancelled=true`
        }
      })
    });

    const subData = await subRes.json();
    const approvalLink = subData.links?.find(l => l.rel === 'approve')?.href;

    if (!approvalLink) throw new Error('No approval link in PayPal response');

    return {
      statusCode: 302,
      headers: { Location: approvalLink }
    };

  } catch (err) {
    console.error('PayPal error:', err);
    return {
      statusCode: 500,
      body: `Subscription setup failed: ${err.message}`
    };
  }
};
