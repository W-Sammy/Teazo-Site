import { NextResponse } from "next/server";
import { squareClient } from "@/app/lib/square";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
    }

    const response = await squareClient.orders.get({ orderId: id });
    const order = response.order;

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    function maskPhoneNumber(phone?: string | null): string | undefined {
      if (!phone) return undefined;
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 4) {
        const last4 = digits.slice(-4);
        return `***-***-${last4}`;
      }
      return "***";
    }

    function maskEmail(email?: string | null): string | undefined {
      if (!email) return undefined;
      const parts = email.split("@");
      if (parts.length === 2 && parts[0].length > 0) {
        const firstChar = parts[0][0];
        return `${firstChar}***@${parts[1]}`;
      }
      return "***@***";
    }

    // Determine if the order has been paid (has tenders applied or marked completed)
    const hasTenders = Array.isArray(order.tenders) && order.tenders.length > 0;
    const isCompleted = order.state === "COMPLETED";
    const isPaid = hasTenders || isCompleted;

    // Redact sensitive customer contact PII over public endpoint
    const sanitizedOrder = {
      id: order.id,
      state: order.state,
      isPaid,
      locationId: order.locationId,
      lineItems: order.lineItems,
      fulfillments: order.fulfillments?.map((f) => ({
        type: f.type,
        state: f.state,
        pickupDetails: f.pickupDetails
          ? {
              scheduleType: f.pickupDetails.scheduleType,
              pickupAt: f.pickupDetails.pickupAt,
              recipient: {
                displayName: f.pickupDetails.recipient?.displayName,
                phoneNumber: maskPhoneNumber(f.pickupDetails.recipient?.phoneNumber),
                emailAddress: maskEmail(f.pickupDetails.recipient?.emailAddress),
              },
              note: f.pickupDetails.note,
            }
          : undefined,
      })),
      totalMoney: order.totalMoney,
      totalTaxMoney: order.totalTaxMoney,
      totalTipMoney: order.totalTipMoney,
      totalDiscountMoney: order.totalDiscountMoney,
    };

    return NextResponse.json({ order: sanitizedOrder });
  } catch (error) {
    console.error("GET /api/orders/[id] failed:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve order details.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
