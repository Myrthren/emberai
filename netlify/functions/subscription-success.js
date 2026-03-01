// netlify/functions/subscription-success.js
// Called by PayPal after user approves subscription — updates Supabase with new plan

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const { plan, userId, subscription_id } = event.queryStringParameters || {};
  const BASE_URL = process.env.URL || 'https://your-site.netlify.app';

  if (!plan || !userId) {
    return { statusCode: 302, headers: { Location: `${BASE_URL}/?error=missing-params` } };
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY // use service key server-side
    );

    // Upsert subscription record
    const { error } = await sb.from('subscriptions').upsert({
      user_id: userId,
      plan: plan,
      paypal_subscription_id: subscription_id || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (error) throw error;

    // Redirect back to app with success message
    return {
      statusCode: 302,
      headers: { Location: `${BASE_URL}/?subscribed=${plan}` }
    };

  } catch (err) {
    console.error('Subscription activation error:', err);
    return {
      statusCode: 302,
      headers: { Location: `${BASE_URL}/?error=activation-failed` }
    };
  }
};
