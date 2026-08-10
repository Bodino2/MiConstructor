import { getPublicShortlistBillingPolicy } from "@/lib/shortlist-pricing";

export async function GET() {
  return Response.json({ success: true, data: getPublicShortlistBillingPolicy() });
}
