"use client";

import { useEffect } from "react";
import { PROPERTY_DEPT_COOKIE } from "./list-prefs";


/** 現場一覧で選んだ部門タブを覚えておく（次に開いたときも同じタブにする） */
export function RememberDeptTab({ value }: { value: string }) {
  useEffect(() => {
    document.cookie = `${PROPERTY_DEPT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [value]);
  return null;
}
