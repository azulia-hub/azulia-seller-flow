package in.azulia.seller;

import org.json.JSONArray;
import org.json.JSONObject;

public final class OrderNoticePolicyCheck {
    private static void check(boolean result) { if(!result)throw new AssertionError("Order notice policy regression"); }
    public static void main(String[] args) throws Exception {
        check(OrderNoticePolicy.event("","Pending",true).equals("new"));
        check(OrderNoticePolicy.event("","Unshipped",false).isEmpty());
        check(OrderNoticePolicy.event("Pending","Unshipped",false).equals("confirmed"));
        check(OrderNoticePolicy.event("PendingAvailability","PartiallyShipped",false).equals("confirmed"));
        check(OrderNoticePolicy.event("Unshipped","Unshipped",true).isEmpty());
        check(OrderNoticePolicy.event("Pending","Canceled",true).isEmpty());
        check(OrderNoticePolicy.fulfillment("").equals("Fulfillment pending"));
        check(OrderNoticePolicy.fulfillment("MFN").equals("FBM"));
        check(OrderNoticePolicy.fulfillment("AFN").equals("FBA"));

        // Multi-SKU order tests
        // 1. Empty items -> "Product details pending"
        JSONObject emptyOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        OrderNoticePolicy.MultiSkuOrderNotice emptyNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", emptyOrder, null, null);
        check(emptyNotice.distinctProducts == 0);
        check(emptyNotice.totalUnits == null);
        check(emptyNotice.compactSummary.equals("Product details pending"));
        check(emptyNotice.expandedText.equals("Product details pending"));

        // 2. Multi-SKU order: 3 distinct products, 5 units
        JSONObject multiOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        JSONArray items = new JSONArray()
            .put(new JSONObject().put("sku", "SKU-A").put("title", "Product A").put("quantity", 2).put("imageUrl", "https://img.test/a.jpg"))
            .put(new JSONObject().put("sku", "SKU-B").put("title", "Product B").put("quantity", 1))
            .put(new JSONObject().put("sku", "SKU-C").put("title", "Product C").put("quantity", 2));
        multiOrder.put("items", items);

        OrderNoticePolicy.MultiSkuOrderNotice multiNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", multiOrder, null, null);
        check(multiNotice.distinctProducts == 3);
        check(multiNotice.totalUnits != null && multiNotice.totalUnits == 5);
        check(multiNotice.compactSummary.equals("3 products · 5 units"));
        check(multiNotice.expandedText.contains("• 2 × Product A (SKU-A)"));
        check(multiNotice.expandedText.contains("• 1 × Product B (SKU-B)"));
        check(multiNotice.expandedText.contains("• 2 × Product C (SKU-C)"));
        check(multiNotice.primaryImage.equals("https://img.test/a.jpg"));

        // 3. Repeated item identities merged and quantities summed
        JSONObject repeatedOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        JSONArray repItems = new JSONArray()
            .put(new JSONObject().put("sku", "SKU-SAME").put("title", "Item 1").put("quantity", 3))
            .put(new JSONObject().put("sku", "SKU-SAME").put("title", "Item 1").put("quantity", 2));
        repeatedOrder.put("items", repItems);

        OrderNoticePolicy.MultiSkuOrderNotice repNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", repeatedOrder, null, null);
        check(repNotice.distinctProducts == 1);
        check(repNotice.totalUnits != null && repNotice.totalUnits == 5);
        check(repNotice.compactSummary.equals("1 product · 5 units"));
        check(repNotice.expandedText.equals("• 5 × Item 1 (SKU-SAME)"));

        // 4. Missing / unknown quantity never assumed to be 1 or partial
        JSONObject unknownQtyOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        JSONArray unkItems = new JSONArray()
            .put(new JSONObject().put("sku", "SKU-KNOWN").put("title", "Item 1").put("quantity", 2))
            .put(new JSONObject().put("sku", "SKU-UNKNOWN").put("title", "Item 2")); // no quantity
        unknownQtyOrder.put("items", unkItems);

        OrderNoticePolicy.MultiSkuOrderNotice unkNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", unknownQtyOrder, null, null);
        check(unkNotice.distinctProducts == 2);
        check(unkNotice.totalUnits == null);
        check(unkNotice.compactSummary.equals("2 products · quantity unknown"));
        check(unkNotice.expandedText.contains("• 2 × Item 1 (SKU-KNOWN)"));
        check(unkNotice.expandedText.contains("• Item 2 (SKU-UNKNOWN) · quantity unknown"));

        // 5. Truncation with truthful "+ N more" when > 5 items
        JSONObject manyItemsOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        JSONArray many = new JSONArray();
        for (int i = 1; i <= 8; i++) {
            many.put(new JSONObject().put("sku", "SKU-" + i).put("title", "Product " + i).put("quantity", 1));
        }
        manyItemsOrder.put("items", many);

        OrderNoticePolicy.MultiSkuOrderNotice manyNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", manyItemsOrder, null, null);
        check(manyNotice.distinctProducts == 8);
        check(manyNotice.totalUnits != null && manyNotice.totalUnits == 8);
        check(manyNotice.compactSummary.equals("8 products · 8 units"));
        check(manyNotice.expandedText.contains("+ 3 more"));

        // 6. Catalog lookup fallback for title/image by ASIN
        JSONObject catOrder = new JSONObject().put("AmazonOrderId", "404-1234567-1234567");
        catOrder.put("items", new JSONArray().put(new JSONObject().put("asin", "B00TESTASIN").put("quantity", 1)));
        OrderNoticePolicy.CatalogLookup catLookup = (asin) -> {
            if ("B00TESTASIN".equals(asin)) {
                try {
                    return new JSONObject().put("title", "Catalog Product").put("imageUrl", "https://img.test/cat.jpg");
                } catch (Exception e) { return null; }
            }
            return null;
        };
        OrderNoticePolicy.MultiSkuOrderNotice catNotice = OrderNoticePolicy.summarizeOrder("404-1234567-1234567", catOrder, null, catLookup);
        check(catNotice.distinctProducts == 1);
        check(catNotice.totalUnits != null && catNotice.totalUnits == 1);
        check(catNotice.expandedText.equals("• 1 × Catalog Product"));
        check(catNotice.primaryImage.equals("https://img.test/cat.jpg"));

        System.out.println("All order notice policy and multi-SKU checks passed");
    }
}
