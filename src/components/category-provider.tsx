"use client";

import { createContext, useContext } from "react";
import { DEFAULT_CATEGORIES, type Cat } from "@/lib/categories";

const CategoryContext = createContext<Cat[]>(DEFAULT_CATEGORIES);

/** 種別マスタを画面全体に配る（(app) レイアウトで getCategories() の結果を渡す） */
export function CategoryProvider({ categories, children }: { categories: Cat[]; children: React.ReactNode }) {
  return <CategoryContext.Provider value={categories}>{children}</CategoryContext.Provider>;
}

export function useCategories(): Cat[] {
  return useContext(CategoryContext);
}
