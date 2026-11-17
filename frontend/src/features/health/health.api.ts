import { useQuery } from "@tanstack/react-query";
import api from "../../lib/axios";

export interface HealthResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/api/health");
  return data;
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: 1,
  });
}
