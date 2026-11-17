package in.azulia.seller;

import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Source status observations, multi-SKU aggregation and formatting, independent of Android notification APIs and money. */
final class OrderNoticePolicy {
    static String event(String previous, String current, boolean newPurchase) {
        boolean active = current.equals("Pending") || current.equals("PendingAvailability")
                || current.equals("Unshipped") || current.equals("PartiallyShipped") || current.equals("Shipped");
        if (!active) return "";
        if (previous.isEmpty()) return newPurchase ? "new" : "";
        boolean pending = previous.equals("Pending") || previous.equals("PendingAvailability");
        return pending && (current.equals("Unshipped") || current.equals("PartiallyShipped") || current.equals("Shipped")) ? "confirmed" : "";
    }

    static String fulfillment(String channel) {
        return channel.equals("AFN") ? "FBA" : channel.equals("MFN") ? "FBM" : "Fulfillment pending";
    }

    public static final class MultiSkuOrderNotice {
        public final int distinctProducts;
        public final Integer totalUnits; // null if any quantity is unknown
        public final String compactSummary;
        public final String expandedText;
        public final String primaryImage;

        public MultiSkuOrderNotice(int distinctProducts, Integer totalUnits, String compactSummary, String expandedText, String primaryImage) {
            this.distinctProducts = distinctProducts;
            this.totalUnits = totalUnits;
            this.compactSummary = compactSummary;
            this.expandedText = expandedText;
            this.primaryImage = primaryImage;
        }
    }

    private static class GroupedItem {
        final String identity;
        String sku;
        String asin;
        String title;
        String image;
        Integer quantity; // null if unknown
        boolean quantityUnknown;

        GroupedItem(String identity, String sku, String asin, String title, String image, Integer quantity, boolean quantityUnknown) {
            this.identity = identity;
            this.sku = sku;
            this.asin = asin;
            this.title = title;
            this.image = image;
            this.quantity = quantity;
            this.quantityUnknown = quantityUnknown;
        }
    }

    public interface CatalogLookup {
        JSONObject getCatalog(String asin);
    }

    public static MultiSkuOrderNotice summarizeOrder(String orderId, JSONObject order, JSONObject extraMeta, CatalogLookup catalog) {
        JSONArray items = null;
        if (order != null) items = order.optJSONArray("items");
        if ((items == null || items.length() == 0) && extraMeta != null) {
            items = extraMeta.optJSONArray("items");
        }

        String fallbackImage = "";
        String fallbackTitle = "";
        if (order != null) {
            fallbackImage = optText(order, "imageUrl");
            fallbackTitle = optText(order, "title");
        }
        if (fallbackImage.isEmpty() && extraMeta != null) {
            fallbackImage = optText(extraMeta, "imageUrl");
        }
        if (fallbackTitle.isEmpty() && extraMeta != null) {
            fallbackTitle = optText(extraMeta, "title");
        }

        if (items == null || items.length() == 0) {
            String summary = "Product details pending";
            String expanded = !fallbackTitle.isEmpty() ? fallbackTitle : "Product details pending";
            return new MultiSkuOrderNotice(0, null, summary, expanded, fallbackImage);
        }

        Map<String, GroupedItem> map = new LinkedHashMap<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String sku = optText(item, "sku");
            String asin = optText(item, "asin");
            String title = optText(item, "title");
            String img = optText(item, "imageUrl");

            if (title.isEmpty() && !asin.isEmpty() && catalog != null) {
                try {
                    JSONObject cat = catalog.getCatalog(asin);
                    if (cat != null) {
                        if (title.isEmpty()) title = optText(cat, "title");
                        if (img.isEmpty()) img = optText(cat, "imageUrl");
                    }
                } catch (Exception ignored) {}
            }

            Integer qty = null;
            boolean isUnknown = false;
            if (item.has("quantity") && !item.isNull("quantity")) {
                int q = item.optInt("quantity", -1);
                if (q >= 0) qty = q;
                else isUnknown = true;
            } else if (item.has("QuantityOrdered") && !item.isNull("QuantityOrdered")) {
                int q = item.optInt("QuantityOrdered", -1);
                if (q >= 0) qty = q;
                else isUnknown = true;
            } else {
                isUnknown = true;
            }

            String key = !sku.isEmpty() ? sku : (!asin.isEmpty() ? asin : (!title.isEmpty() ? title : ("item_" + i)));
            GroupedItem existing = map.get(key);
            if (existing == null) {
                map.put(key, new GroupedItem(key, sku, asin, title, img, qty, isUnknown));
            } else {
                // Repeated item identity: combine quantities if known
                if (existing.quantityUnknown || isUnknown || existing.quantity == null || qty == null) {
                    existing.quantity = null;
                    existing.quantityUnknown = true;
                } else {
                    existing.quantity += qty;
                }
                if (existing.title.isEmpty() && !title.isEmpty()) existing.title = title;
                if (existing.image.isEmpty() && !img.isEmpty()) existing.image = img;
            }
        }

        if (map.isEmpty()) {
            return new MultiSkuOrderNotice(0, null, "Product details pending", "Product details pending", fallbackImage);
        }

        int distinctCount = map.size();
        Integer totalUnits = 0;
        boolean allUnitsKnown = true;
        String primaryImage = fallbackImage;

        for (GroupedItem g : map.values()) {
            if (primaryImage.isEmpty() && !g.image.isEmpty()) {
                primaryImage = g.image;
            }
            if (g.quantityUnknown || g.quantity == null) {
                allUnitsKnown = false;
            } else if (allUnitsKnown) {
                totalUnits += g.quantity;
            }
        }
        if (!allUnitsKnown) {
            totalUnits = null;
        }

        // Compact summary:
        String pWord = distinctCount == 1 ? "1 product" : distinctCount + " products";
        String compactSummary;
        if (totalUnits != null) {
            String uWord = totalUnits == 1 ? "1 unit" : totalUnits + " units";
            compactSummary = pWord + " · " + uWord;
        } else {
            compactSummary = pWord + " · quantity unknown";
        }

        // Expanded text:
        StringBuilder sb = new StringBuilder();
        int maxLines = 5;
        int count = 0;
        for (GroupedItem g : map.values()) {
            if (count >= maxLines) break;
            if (sb.length() > 0) sb.append("\n");
            sb.append("• ");
            if (g.quantity != null) {
                sb.append(g.quantity).append(" × ");
            }
            String displayTitle = !g.title.isEmpty() ? g.title : (!g.sku.isEmpty() ? g.sku : "Product");
            if (!g.title.isEmpty() && !g.sku.isEmpty() && !g.title.equalsIgnoreCase(g.sku)) {
                sb.append(displayTitle).append(" (").append(g.sku).append(")");
            } else {
                sb.append(displayTitle);
            }
            if (g.quantity == null) {
                sb.append(" · quantity unknown");
            }
            count++;
        }
        if (map.size() > maxLines) {
            int remaining = map.size() - maxLines;
            sb.append("\n+ ").append(remaining).append(" more");
        }

        return new MultiSkuOrderNotice(distinctCount, totalUnits, compactSummary, sb.toString(), primaryImage);
    }

    private static String optText(JSONObject obj, String key) {
        String val = obj.optString(key, "");
        return "null".equals(val) ? "" : val.trim();
    }
}
