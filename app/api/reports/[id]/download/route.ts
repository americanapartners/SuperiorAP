import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { data: report, error } = await supabase
      .from("reports")
      .select("file_url, report_name, status")
      .eq("id", id)
      .single();

    if (error || !report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (report.status !== "completed" || !report.file_url) {
      return NextResponse.json({ error: "File not available" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data: signedData, error: signError } = await adminClient.storage
      .from("reports")
      .createSignedUrl(report.file_url, 3600);

    if (signError || !signedData) throw signError;

    return NextResponse.json({ url: signedData.signedUrl, name: report.report_name });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
  }
}
