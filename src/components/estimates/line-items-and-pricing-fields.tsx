"use client";

import { useId, useState } from "react";
import {
  LINE_ITEM_CATEGORIES,
  LINE_ITEM_CATEGORY_LABELS,
  estimateCostSubtotal,
  estimateMarkupAmount,
  formatCurrency,
  type LineItemCategory,
  type MarkupType,
} from "@/lib/estimates/types";

type Row = {
  key: string;
  description: string;
  quantity: string;
  unitCost: string;
};

const inputClass =
  "block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function emptyRowMap(): Record<LineItemCategory, Row[]> {
  return { labor: [], materials: [], equipment: [], other: [] };
}

export function LineItemsAndPricingFields({
  initialItems,
  initialMarkupType,
  initialMarkupValue,
  initialMinimumJobPrice,
  initialFinalSellingPrice,
}: {
  initialItems: {
    category: LineItemCategory;
    description: string;
    quantity: number;
    unit_cost: number;
  }[];
  initialMarkupType: MarkupType;
  initialMarkupValue: number;
  initialMinimumJobPrice: number | null;
  initialFinalSellingPrice: number | null;
}) {
  const idPrefix = useId();

  const [rowsByCategory, setRowsByCategory] = useState<
    Record<LineItemCategory, Row[]>
  >(() => {
    const grouped = emptyRowMap();
    initialItems.forEach((item, index) => {
      grouped[item.category].push({
        key: `initial-${index}`,
        description: item.description,
        quantity: String(item.quantity),
        unitCost: String(item.unit_cost),
      });
    });
    return grouped;
  });

  const [markupType, setMarkupType] = useState<MarkupType>(initialMarkupType);
  const [markupValue, setMarkupValue] = useState(String(initialMarkupValue));
  const [minimumJobPrice, setMinimumJobPrice] = useState(
    initialMinimumJobPrice != null ? String(initialMinimumJobPrice) : "",
  );
  const [finalSellingPrice, setFinalSellingPrice] = useState(
    initialFinalSellingPrice != null ? String(initialFinalSellingPrice) : "",
  );

  function addRow(category: LineItemCategory) {
    setRowsByCategory((prev) => ({
      ...prev,
      [category]: [
        ...prev[category],
        {
          key:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${category}-${Date.now()}-${prev[category].length}`,
          description: "",
          quantity: "1",
          unitCost: "0",
        },
      ],
    }));
  }

  function updateRow(
    category: LineItemCategory,
    key: string,
    field: "description" | "quantity" | "unitCost",
    value: string,
  ) {
    setRowsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].map((row) =>
        row.key === key ? { ...row, [field]: value } : row,
      ),
    }));
  }

  function removeRow(category: LineItemCategory, key: string) {
    setRowsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].filter((row) => row.key !== key),
    }));
  }

  const subtotals = LINE_ITEM_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = rowsByCategory[category].reduce(
        (sum, row) =>
          sum + (Number(row.quantity) || 0) * (Number(row.unitCost) || 0),
        0,
      );
      return acc;
    },
    {} as Record<LineItemCategory, number>,
  );

  const costSubtotal = estimateCostSubtotal({
    labor_subtotal: subtotals.labor,
    materials_subtotal: subtotals.materials,
    equipment_subtotal: subtotals.equipment,
    other_expenses_subtotal: subtotals.other,
  });
  const markupValueNumber = Number(markupValue) || 0;
  const markupAmount = estimateMarkupAmount(
    { markup_type: markupType, markup_value: markupValueNumber },
    costSubtotal,
  );
  const suggestedPrice = costSubtotal + markupAmount;

  const minimumJobPriceNumber =
    minimumJobPrice.trim().length > 0 ? Number(minimumJobPrice) : null;
  const finalSellingPriceNumber =
    finalSellingPrice.trim().length > 0 ? Number(finalSellingPrice) : null;
  const belowMinimum =
    minimumJobPriceNumber != null &&
    finalSellingPriceNumber != null &&
    finalSellingPriceNumber < minimumJobPriceNumber;

  const serializedItems = LINE_ITEM_CATEGORIES.flatMap((category) =>
    rowsByCategory[category]
      .filter((row) => row.description.trim().length > 0)
      .map((row) => ({
        category,
        description: row.description.trim(),
        quantity: Number(row.quantity) || 0,
        unit_cost: Number(row.unitCost) || 0,
      })),
  );

  return (
    <div className="space-y-8">
      <input type="hidden" name="lineItems" value={JSON.stringify(serializedItems)} />

      {LINE_ITEM_CATEGORIES.map((category) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {LINE_ITEM_CATEGORY_LABELS[category]}
            </h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              {formatCurrency(subtotals[category])}
            </span>
          </div>

          {rowsByCategory[category].length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              No {LINE_ITEM_CATEGORY_LABELS[category].toLowerCase()} items yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rowsByCategory[category].map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_4.5rem_5.5rem_auto] items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Description"
                    value={row.description}
                    onChange={(event) =>
                      updateRow(category, row.key, "description", event.target.value)
                    }
                    aria-label={`${LINE_ITEM_CATEGORY_LABELS[category]} item description`}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(event) =>
                      updateRow(category, row.key, "quantity", event.target.value)
                    }
                    aria-label={`${LINE_ITEM_CATEGORY_LABELS[category]} item quantity`}
                    className={`${inputClass} px-2`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="$/unit"
                    value={row.unitCost}
                    onChange={(event) =>
                      updateRow(category, row.key, "unitCost", event.target.value)
                    }
                    aria-label={`${LINE_ITEM_CATEGORY_LABELS[category]} item unit cost`}
                    className={`${inputClass} px-2`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(category, row.key)}
                    aria-label={`Remove ${LINE_ITEM_CATEGORY_LABELS[category].toLowerCase()} item`}
                    className="px-2 text-zinc-400 transition hover:text-red-600 dark:hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => addRow(category)}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            + Add {LINE_ITEM_CATEGORY_LABELS[category].toLowerCase()} item
          </button>
        </div>
      ))}

      <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Cost subtotal</span>
          <span className="font-medium text-zinc-950 dark:text-zinc-50">
            {formatCurrency(costSubtotal)}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${idPrefix}-markupType`}
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Markup type
            </label>
            <select
              id={`${idPrefix}-markupType`}
              name="markupType"
              value={markupType}
              onChange={(event) => setMarkupType(event.target.value as MarkupType)}
              className={`${inputClass} mt-1`}
            >
              <option value="percent">Percent (%)</option>
              <option value="amount">Flat amount ($)</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-markupValue`}
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Markup {markupType === "percent" ? "(%)" : "($)"}
            </label>
            <input
              id={`${idPrefix}-markupValue`}
              type="number"
              step="0.01"
              min="0"
              name="markupValue"
              value={markupValue}
              onChange={(event) => setMarkupValue(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Suggested price</span>
          <span className="font-medium text-zinc-950 dark:text-zinc-50">
            {formatCurrency(suggestedPrice)}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${idPrefix}-minimumJobPrice`}
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Minimum job price
            </label>
            <input
              id={`${idPrefix}-minimumJobPrice`}
              type="number"
              step="0.01"
              min="0"
              name="minimumJobPrice"
              value={minimumJobPrice}
              onChange={(event) => setMinimumJobPrice(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor={`${idPrefix}-finalSellingPrice`}
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Final selling price
              </label>
              <button
                type="button"
                onClick={() => setFinalSellingPrice(suggestedPrice.toFixed(2))}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Use suggested
              </button>
            </div>
            <input
              id={`${idPrefix}-finalSellingPrice`}
              type="number"
              step="0.01"
              min="0"
              name="finalSellingPrice"
              value={finalSellingPrice}
              onChange={(event) => setFinalSellingPrice(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        {belowMinimum && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            Final selling price is below the minimum job price.
          </p>
        )}
      </div>
    </div>
  );
}
