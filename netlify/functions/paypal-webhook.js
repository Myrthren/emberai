// netlify/functions/paypal-webhook.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const payload = JSON.parse(event.body);
    const eventType = payload.event_type;
    const resource = payload.resource;
    const customId = resource.custom_id;

    const planMap = {
      [process.env.PAYPAL_FLAME_PLAN_ID]: 'flame',
      [process.env.PAYPAL_INFERNO_PLAN_ID]: 'inferno'
    };

    let newPlan = null;

    if (['BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.DENIED'].includes(eventType)) {
      newPlan = 'free';
    } else if (['BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.RENEWED'].includes(eventType)) {
      newPlan = planMap[resource.plan_id] || 'flame';
    }

    if (newPlan && customId) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: customId,
          plan: newPlan,
          paypal_subscription_id: resource.id,
          updated_at: new Date().toISOString()
        })
      });
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
