// netlify/functions/paypal-webhook.js
// Handles PayPal subscription lifecycle events (cancellations, renewals, failures)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const payload = JSON.parse(event.body);
    const eventType = payload.event_type;
    const resource = payload.resource;

    console.log('PayPal webhook event:', eventType);

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        // Downgrade to free
        const customId = resource.custom_id; // this is our userId
        if (customId) {
          await sb.from('subscriptions').upsert({
            user_id: customId,
            plan: 'free',
            paypal_subscription_id: resource.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.RENEWED': {
        // Confirm active subscription
        const customId = resource.custom_id;
        const planId = resource.plan_id;
        
        // Map PayPal plan IDs to our tier names
        const planMap = {
          [process.env.PAYPAL_FLAME_PLAN_ID]: 'flame',
          [process.env.PAYPAL_INFERNO_PLAN_ID]: 'inferno'
        };

        const tier = planMap[planId] || 'flame';

        if (customId) {
          await sb.from('subscriptions').upsert({
            user_id: customId,
            plan: tier,
            paypal_subscription_id: resource.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
        break;
      }

      case 'PAYMENT.SALE.DENIED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        // Optionally downgrade or flag for follow-up
        const customId = resource.custom_id;
        if (customId) {
          await sb.from('subscriptions').upsert({
            user_id: customId,
            plan: 'free',
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
        break;
      }

      default:
        console.log('Unhandled event type:', eventType);
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: err.message };
  }
};
