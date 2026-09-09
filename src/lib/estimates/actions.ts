"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ESTIMATE_STATUSES,
  LINE_ITEM_CATEGORIES,
  type EstimateStatus,
  type LineItemCategory,
  type MarkupType,
} from "@/lib/estimates/types";

const LIST_PATH = "/dashboard/estimates";

type EstimateFields = {
  customer_id: string | null;
  title: string;
  status: EstimateStatus;
  description: string | null;
  internal_notes: string | null;
  markup_type: MarkupType;
  markup_value: number;
  minimum_job_price: number | null;
  final_selling_price: number | null;
};

type ParsedLineItem = {
  category: LineItemCategory;
  description: string;
  quantity: number;
  unit_cost: number;
};

function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

/** Parses a possibly-blank numeric form field. Blank -> null, invalid -> null. */
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw.length === 0) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readEstimateFields(formData: FormData): EstimateFields {
  const status = String(formData.get("status") ?? "draft");
  const markupType = String(formData.get("markupType") ?? "percent");

  return {
    customer_id: optionalString(formData, "customerId"),
    title: String(formData.get("title") ?? "").trim(),
    status: (ESTIMATE_STATUSES as string[]).includes(status)
      ? (status as EstimateStatus)
      : "draft",
    description: optionalString(formData, "description"),
    internal_notes: optionalString(formData, "internalNotes"),
    markup_type: markupType === "amount" ? "amount" : "percent",
    markup_value: optionalNumber(formData, "markupValue") ?? 0,
    minimum_job_price: optionalNumber(formData, "minimumJobPrice"),
    final_selling_price: optionalNumber(formData, "finalSellingPrice"),
  };
}

/**
 * Parses the hidden `lineItems` JSON field (see LineItemsAndPricingFields).
 * Malformed or blank-description rows are dropped rather than rejected —
 * the client already filters these before serializing, this is a second,
 * server-side pass over the same data, not a new restriction.
 */
function readLineItems(formData: FormData): ParsedLineItem[] {
  const raw = String(formData.get("lineItems") ?? "[]");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      category: LINE_ITEM_CATEGORIES.includes(item.category as LineItemCategory)
        ? (item.category as LineItemCategory)
        : "other",
      description: String(item.description ?? "").trim(),
      quantity: Number(item.quantity) || 0,
      unit_cost: Number(item.unit_cost) || 0,
    }))
    .filter((item) => item.description.length > 0);
}

function validateEstimateFields(fields: EstimateFields): string | null {
  if (!fields.title) {
    return "Title is required.";
  }
  return null;
}

export async function createEstimate(formData: FormData) {
  const fields = readEstimateFields(formData);
  const validationError = validateEstimateFields(fields);

  if (validationError) {
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(validationError)}`);
  }

  const lineItems = readLineItems(formData);
  const supabase = await createClient();

  // Subtotal columns are not set here — they default to 0 and are
  // computed by save_estimate_line_items() below, from these same items.
  const { data, error } = await supabase
    .from("estimates")
    .insert({
      customer_id: fields.customer_id,
      title: fields.title,
      status: fields.status,
      description: fields.description,
      internal_notes: fields.internal_notes,
      markup_type: fields.markup_type,
      markup_value: fields.markup_value,
      minimum_job_price: fields.minimum_job_price,
      final_selling_price: fields.final_selling_price,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `${LIST_PATH}/new?error=${encodeURIComponent(
        error?.message ?? "Could not create estimate.",
      )}`,
    );
  }

  const { error: lineItemsError } = await supabase.rpc(
    "save_estimate_line_items",
    { p_estimate_id: data.id, p_items: lineItems },
  );

  if (lineItemsError) {
    redirect(
      `${LIST_PATH}/${data.id}?error=${encodeURIComponent(lineItemsError.message)}`,
    );
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${data.id}`);
}

export async function updateEstimate(estimateId: string, formData: FormData) {
  const fields = readEstimateFields(formData);
  const validationError = validateEstimateFields(fields);
  const editPath = `${LIST_PATH}/${estimateId}/edit`;

  if (validationError) {
    redirect(`${editPath}?error=${encodeURIComponent(validationError)}`);
  }

  const lineItems = readLineItems(formData);
  const supabase = await createClient();

  // RLS scopes this to rows in the caller's own business — an
  // estimateId belonging to another business simply matches zero rows.
  const { error } = await supabase
    .from("estimates")
    .update({
      customer_id: fields.customer_id,
      title: fields.title,
      status: fields.status,
      description: fields.description,
      internal_notes: fields.internal_notes,
      markup_type: fields.markup_type,
      markup_value: fields.markup_value,
      minimum_job_price: fields.minimum_job_price,
      final_selling_price: fields.final_selling_price,
    })
    .eq("id", estimateId);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  const { error: lineItemsError } = await supabase.rpc(
    "save_estimate_line_items",
    { p_estimate_id: estimateId, p_items: lineItems },
  );

  if (lineItemsError) {
    redirect(`${editPath}?error=${encodeURIComponent(lineItemsError.message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${estimateId}`);
  redirect(`${LIST_PATH}/${estimateId}`);
}

export async function deleteEstimate(estimateId: string) {
  const supabase = await createClient();

  // Same RLS scoping as above — this can only ever delete a row that
  // belongs to the caller's own business. Its line items cascade with it.
  const { error } = await supabase
    .from("estimates")
    .delete()
    .eq("id", estimateId);

  if (error) {
    redirect(
      `${LIST_PATH}/${estimateId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
