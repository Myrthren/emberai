// netlify/functions/subscription-success.js
exports.handler = async (event) => {
  const { plan, userId, subscription_id } = event.queryStringParameters || {};
  const BASE_URL = 'https://ember-ai-restaurant.netlify.app';

  if (!plan || !userId) {
    return { statusCode: 302, headers: { Location: `${BASE_URL}/?error=missing-params` } };
  }

  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId,
        plan: plan,
        paypal_subscription_id: subscription_id || null,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) throw new Error(await res.text());

    return { statusCode: 302, headers: { Location: `${BASE_URL}/?subscribed=${plan}` } };

  } catch (err) {
    console.error('Subscription activation error:', err);
    return { statusCode: 302, headers: { Location: `${BASE_URL}/?error=activation-failed` } };
  }
};
