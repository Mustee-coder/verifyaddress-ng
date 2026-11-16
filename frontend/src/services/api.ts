const API_URL = import.meta.env.VITE_API_BASE_URL;

export async function checkBackend() {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error("Backend connection failed");
  }

  return response.json();
}
