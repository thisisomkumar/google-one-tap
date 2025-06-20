// server.js
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");

const app = express();
// Allow CORS requests from your store domain
app.use(cors({ origin: "https://buydaze.in", credentials: true }));
app.use(express.json());

const CLIENT_ID        = process.env.GOOGLE_CLIENT_ID;
const SHOPIFY_DOMAIN   = process.env.SHOPIFY_DOMAIN;
const STOREFRONT_TOKEN = process.env.STOREFRONT_TOKEN;

const googleClient = new OAuth2Client(CLIENT_ID);

app.post("/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    const { email, name } = ticket.getPayload();

    // Attempt login
    let resp = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `
          mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
            customerAccessTokenCreate(input: $input) {
              customerAccessToken { accessToken }
            }
          }
        `,
        variables: { input: { email, password: credential } }
      })
    });
    const loginJson = await resp.json();

    // If login failed, create user then re-login
    if (!loginJson.data.customerAccessTokenCreate.customerAccessToken) {
      await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `
            mutation customerCreate($input: CustomerCreateInput!) {
              customerCreate(input: $input) {
                customer { id }
              }
            }
          `,
          variables: { input: { email, firstName: name, password: credential } }
        })
      });
      // retry login (ignore errors)
      await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `
            mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
              customerAccessTokenCreate(input: $input) {
                customerAccessToken { accessToken }
              }
            }
          `,
          variables: { input: { email, password: credential } }
        })
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Bind to Render’s PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡️ Server on ${PORT}`));
