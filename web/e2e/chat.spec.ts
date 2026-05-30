import { test, expect } from "@playwright/test";

const SSE_BODY = [
  'data: {"type":"message_start","id":"m1"}',
  'data: {"type":"tool_call","id":"tc1","name":"search_knowledge","args":{"query":"structured note"}}',
  'data: {"type":"tool_result","id":"tc1","summary":"5 chunks · ESMA","graph_delta":{"nodes":[{"id":"Reg:MiFID II","label":"Regulation"}],"edges":[]}}',
  'data: {"type":"token","text":"A structured note is complex under MiFID II."}',
  'data: {"type":"citation","doc_title":"ESMA 2015-1787","sensitivity":"C2 Internal","chunk_text":"..."}',
  'data: {"type":"message_end","stop_reason":"end_turn"}',
].join("\n\n") + "\n\n";

test("renders a full chat turn", async ({ page }) => {
  await page.route("**/chat", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: SSE_BODY }),
  );

  await page.goto("/");
  await page.getByPlaceholder("Ask the company brain…").fill("is it complex?");
  await page.getByPlaceholder("Ask the company brain…").press("Enter");

  await expect(page.getByText("A structured note is complex under MiFID II.")).toBeVisible();
  await expect(page.getByText("search_knowledge")).toBeVisible();
  await expect(page.getByText("ESMA 2015-1787")).toBeVisible();
});
