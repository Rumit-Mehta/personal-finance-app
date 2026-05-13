import { config } from "./config.js";
import { getAccessToken } from "./oauth.js";

export class MonzoClient {
  async whoAmI() {
    return this.get("/ping/whoami");
  }

  async listAccounts({ accountType } = {}) {
    const params = new URLSearchParams();

    if (accountType) {
      params.set("account_type", accountType);
    }

    return this.get(`/accounts${toQuery(params)}`);
  }

  async getBalance(accountId) {
    return this.get(`/balance?account_id=${encodeURIComponent(accountId)}`);
  }

  async listPots(accountId) {
    return this.get(
      `/pots?current_account_id=${encodeURIComponent(accountId)}`,
    );
  }

  async listTransactions(
    accountId,
    { since, before, limit = 100, expandMerchant = true } = {},
  ) {
    const params = new URLSearchParams({
      account_id: accountId,
      limit: String(limit),
    });

    if (since) {
      params.set("since", since);
    }

    if (before) {
      params.set("before", before);
    }

    if (expandMerchant) {
      params.append("expand[]", "merchant");
    }

    return this.get(`/transactions?${params.toString()}`);
  }

  async get(path) {
    const accessToken = await getAccessToken();
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
      throw new Error(
        `Monzo API request failed (${response.status}) for ${path}: ${JSON.stringify(payload)}`,
      );
    }

    return payload;
  }
}

function toQuery(params) {
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
