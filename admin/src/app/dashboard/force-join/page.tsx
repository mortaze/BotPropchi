"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ForceJoinRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/required-channels");
  }, [router]);
  return null;
}
