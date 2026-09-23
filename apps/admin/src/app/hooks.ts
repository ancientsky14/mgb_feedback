import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Me, Meta } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me"), staleTime: 5 * 60_000 });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta"), staleTime: 60_000 });
}
