// netlify/functions/send-feedback.js
// Delivers feedback/support messages from the EMBER site to keneamaechina@gmail.com
//
// Configure ONE of the following env vars in Netlify:
//   RESEND_API_KEY         — recommended. https://resend.com
//   SENDGRID_API_KEY       — alternative. https://sendgrid.com
//   MAILGUN_API_KEY + MAILGUN_DOMAIN
//
// Optional:
//   FEEDBACK_TO            — override recipient (default: keneamaechina@gmail.com)
//   FEEDBACK_FROM          — override sender ("EMBER Feedback <feedback@ember.app>" by default)

const RECIPIENT = process.env.FEEDBACK_TO || 'keneamaechina@gmail.com';
const FROM = process.env.FEEDBACK_FROM || 'EMBER Feedback <feedback@resend.dev>';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    name = '(not provided)',
    email = '',
    topic = 'General feedback',
    message = '',
    user_id = null,
    plan = 'free',
    user_agent = '',
    page = '',
    sent_at = new Date().toISOString()
  } = payload;

  if (!message || !email) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing message or email' }) };
  }

  const subject = `[EMBER ${topic}] from ${name} (${plan})`;

  const text = [
    `New feedback from the EMBER site.`,
    ``,
    `Topic:   ${topic}`,
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Plan:    ${plan}`,
    `User ID: ${user_id || '(not signed in)'}`,
    `Sent:    ${sent_at}`,
    `Page:    ${page}`,
    `Agent:   ${user_agent}`,
    ``,
    `--- Message ---`,
    message,
    ``
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0805;color:#f0e6d3;">
      <div style="font-family:Georgia,serif;font-size:28px;letter-spacing:4px;color:#e8721a;margin-bottom:4px;">EMBER</div>
      <div style="font-size:11px;letter-spacing:2px;color:#8a6a50;margin-bottom:24px;">NEW FEEDBACK</div>
      <table style="width:100%;font-size:13px;color:#f0e6d3;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8a6a50;width:90px;">Topic</td><td style="padding:6px 0;"><strong>${escapeHtml(topic)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">Name</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#d4a017;">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">Plan</td><td style="padding:6px 0;">${escapeHtml(plan)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">User ID</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${escapeHtml(user_id || '(not signed in)')}</td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">Sent</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${escapeHtml(sent_at)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a6a50;">Page</td><td style="padding:6px 0;font-family:monospace;font-size:11px;">${escapeHtml(page)}</td></tr>
      </table>
      <div style="border-top:1px solid #3d2e22;margin-top:20px;padding-top:20px;">
        <div style="font-size:11px;letter-spacing:2px;color:#8a6a50;margin-bottom:12px;">MESSAGE</div>
        <div style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(message)}</div>
      </div>
      <div style="margin-top:24px;font-size:11px;color:#8a6a50;">Reply directly to <a href="mailto:${escapeHtml(email)}" style="color:#d4a017;">${escapeHtml(email)}</a> — they're expecting you.</div>
    </div>
  `;

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend({ to: RECIPIENT, from: FROM, replyTo: email, subject, text, html });
    } else if (process.env.SENDGRID_API_KEY) {
      await sendViaSendGrid({ to: RECIPIENT, from: FROM, replyTo: email, subject, text, html });
    } else if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      await sendViaMailgun({ to: RECIPIENT, from: FROM, replyTo: email, subject, text, html });
    } else {
      // No email provider configured — log and return success so the frontend
      // fallback (Supabase insert) is still considered useful.
      console.warn('[send-feedback] No email provider env var configured. Payload:', { topic, email, name });
      return {
        statusCode: 202,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queued: true, warning: 'No email provider configured on the server.' })
      };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('[send-feedback] Error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Failed to send feedback' })
    };
  }
};

async function sendViaResend({ to, from, replyTo, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text, html })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

async function sendViaSendGrid({ to, from, replyTo, subject, text, html }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: parseFrom(from),
      reply_to: { email: replyTo },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html }
      ]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid ${res.status}: ${body}`);
  }
}

async function sendViaMailgun({ to, from, replyTo, subject, text, html }) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('h:Reply-To', replyTo);
  params.append('subject', subject);
  params.append('text', text);
  params.append('html', html);

  const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
  const res = await fetch(`https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailgun ${res.status}: ${body}`);
  }
}

function parseFrom(fromStr) {
  const m = fromStr.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  return m ? { email: m[2], name: m[1] } : { email: fromStr };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
