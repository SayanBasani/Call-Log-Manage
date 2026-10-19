const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is not configured");
}

export async function sendCalls(calls: object[]) {
  const response = await fetch(`${API_URL}/api/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calls }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ?? "Failed to upload calls"
    );
  }

  return result;
}

export async function getCalls() {
  const response = await fetch(`${API_URL}/api/calls`);

  if (!response.ok) {
    throw new Error("Failed to retrieve calls");
  }

  return response.json();
}

export async function checkBackend() {
  const response = await fetch(`${API_URL}/health`);
  return response.ok;
}