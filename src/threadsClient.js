const THREADS_API_URL = "https://graph.threads.net/v1.0";

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { text };
  }
}

export async function publishThread({ userId, accessToken, text }) {
  if (!userId) throw new Error("THREADS_USER_ID is required for live posting.");
  if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN is required for live posting.");
  if (!text) throw new Error("Post text is empty.");

  const createResponse = await fetch(`${THREADS_API_URL}/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    body: new URLSearchParams({
      media_type: "TEXT",
      text,
      access_token: accessToken,
    }),
  });
  const createPayload = await readJsonResponse(createResponse);
  if (!createResponse.ok || !createPayload.id) {
    throw new Error(`Threads container creation failed with ${createResponse.status}: ${JSON.stringify(createPayload).slice(0, 500)}`);
  }

  const publishResponse = await fetch(`${THREADS_API_URL}/${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: createPayload.id,
      access_token: accessToken,
    }),
  });
  const publishPayload = await readJsonResponse(publishResponse);
  if (!publishResponse.ok) {
    throw new Error(`Threads publish failed with ${publishResponse.status}: ${JSON.stringify(publishPayload).slice(0, 500)}`);
  }

  return {
    ok: true,
    containerId: createPayload.id,
    publish: publishPayload,
  };
}
