package in.azulia.seller;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.UUID;
import org.json.JSONObject;

/** Builds distinct navigation PendingIntents and validates native notification payloads. No credentials or buyer PII. */
final class NotificationNav {
    static final int RC_ORDER = 1001;
    static final int RC_REFUND = 1002;
    static final int RC_INVENTORY = 1003;
    static final int RC_REVIEW = 1004;
    static final int RC_SYNC = 1005;

    static PendingIntent orderDetail(Context c, String account, String orderId) throws Exception {
        validateAccount(account);
        validateOrderId(orderId);
        String eventId = UUID.randomUUID().toString();
        JSONObject nav = new JSONObject().put("kind", "ORDER_DETAIL").put("account", account).put("orderId", orderId).put("eventId", eventId);
        String actionKey = "ORDER_" + account + "_" + orderId;
        return make(c, actionKey, RC_ORDER ^ (account + ":" + orderId).hashCode(), nav);
    }

    static PendingIntent refundDetail(Context c, String account, String orderId, String transactionId) throws Exception {
        validateAccount(account);
        validateOrderId(orderId);
        validateTransactionId(transactionId);
        String eventId = UUID.randomUUID().toString();
        JSONObject nav = new JSONObject().put("kind", "REFUND_DETAIL").put("account", account).put("orderId", orderId).put("transactionId", transactionId).put("eventId", eventId);
        String actionKey = "REFUND_" + account + "_" + orderId + "_" + transactionId;
        return make(c, actionKey, RC_REFUND ^ (account + ":" + orderId + ":" + transactionId).hashCode(), nav);
    }

    static PendingIntent inventoryRestock(Context c, String account, String sku, String marketplace, String fulfillmentChannel) throws Exception {
        validateAccount(account);
        validateSku(sku);
        String market = marketplace != null && !marketplace.isEmpty() ? marketplace : "AMAZON";
        String channel = fulfillmentChannel != null && !fulfillmentChannel.isEmpty() ? fulfillmentChannel : "LISTING";
        validateMarketplaceOrChannel(market);
        validateMarketplaceOrChannel(channel);
        String eventId = UUID.randomUUID().toString();
        JSONObject nav = new JSONObject().put("kind", "INVENTORY_RESTOCK")
            .put("account", account)
            .put("marketplace", market)
            .put("sku", sku)
            .put("fulfillmentChannel", channel)
            .put("eventId", eventId);
        String actionKey = "INVENTORY_" + account + "_" + market + "_" + sku + "_" + channel;
        return make(c, actionKey, RC_INVENTORY ^ (account + ":" + market + ":" + sku + ":" + channel).hashCode(), nav);
    }

    static PendingIntent reviewRun(Context c, String account, String date) throws Exception {
        validateAccount(account);
        validateDate(date);
        String eventId = UUID.randomUUID().toString();
        JSONObject nav = new JSONObject().put("kind", "REVIEW_RUN").put("account", account).put("date", date).put("eventId", eventId);
        String actionKey = "REVIEW_" + account + "_" + date;
        return make(c, actionKey, RC_REVIEW ^ (account + ":" + date).hashCode(), nav);
    }

    static PendingIntent syncStatus(Context c) throws Exception {
        String eventId = UUID.randomUUID().toString();
        JSONObject nav = new JSONObject().put("kind", "SYNC_STATUS").put("eventId", eventId);
        return make(c, "SYNC_STATUS", RC_SYNC, nav);
    }

    static void validateAccount(String account) {
        if (account == null || !account.matches("^[a-f0-9]{64}$")) {
            throw new IllegalArgumentException("Invalid account");
        }
    }

    static void validateOrderId(String orderId) {
        if (orderId == null || !orderId.matches("^[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}$")) {
            throw new IllegalArgumentException("Invalid orderId");
        }
    }

    static void validateTransactionId(String transactionId) {
        if (transactionId == null || transactionId.isEmpty() || transactionId.length() > 128 || !transactionId.matches("^[a-zA-Z0-9_.:-]+$")) {
            throw new IllegalArgumentException("Invalid transactionId");
        }
    }

    static void validateSku(String sku) {
        if (sku == null || sku.trim().isEmpty() || sku.length() > 180 || hasControlChars(sku)) {
            throw new IllegalArgumentException("Invalid SKU");
        }
    }

    static void validateMarketplaceOrChannel(String val) {
        if (val == null || val.isEmpty() || val.length() > 32 || !val.matches("^[a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Invalid marketplace/channel");
        }
    }

    static void validateDate(String date) {
        if (date == null || !date.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) {
            throw new IllegalArgumentException("Invalid date format");
        }
        try {
            LocalDate parsed = LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE);
            if (parsed.getYear() < 2000 || parsed.getYear() > 2100) {
                throw new IllegalArgumentException("Date out of reasonable range");
            }
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Not a valid calendar date", e);
        }
    }

    static boolean hasControlChars(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < 32 || c == 127) return true;
        }
        return false;
    }

    /**
     * Strictly validates and reconstructs a safe JSONObject with only allowed fields.
     * Returns null if the raw payload is invalid or malformed.
     */
    public static JSONObject validateAndSanitize(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        try {
            JSONObject in = new JSONObject(raw);
            String kind = in.optString("kind", "");
            String eventId = in.optString("eventId", "");
            if (eventId.isEmpty() || !eventId.matches("^[a-zA-Z0-9_-]{1,64}$")) {
                eventId = UUID.randomUUID().toString();
            }
            switch (kind) {
                case "ORDER_DETAIL": {
                    String account = in.optString("account", "");
                    String orderId = in.optString("orderId", "");
                    validateAccount(account);
                    validateOrderId(orderId);
                    return new JSONObject()
                        .put("kind", "ORDER_DETAIL")
                        .put("account", account)
                        .put("orderId", orderId)
                        .put("eventId", eventId);
                }
                case "REFUND_DETAIL": {
                    String account = in.optString("account", "");
                    String orderId = in.optString("orderId", "");
                    String transactionId = in.optString("transactionId", "");
                    validateAccount(account);
                    validateOrderId(orderId);
                    validateTransactionId(transactionId);
                    return new JSONObject()
                        .put("kind", "REFUND_DETAIL")
                        .put("account", account)
                        .put("orderId", orderId)
                        .put("transactionId", transactionId)
                        .put("eventId", eventId);
                }
                case "INVENTORY_RESTOCK": {
                    String account = in.optString("account", "");
                    String sku = in.optString("sku", "");
                    String marketplace = in.optString("marketplace", "AMAZON");
                    String channel = in.optString("fulfillmentChannel", "LISTING");
                    validateAccount(account);
                    validateSku(sku);
                    validateMarketplaceOrChannel(marketplace);
                    validateMarketplaceOrChannel(channel);
                    return new JSONObject()
                        .put("kind", "INVENTORY_RESTOCK")
                        .put("account", account)
                        .put("marketplace", marketplace)
                        .put("sku", sku)
                        .put("fulfillmentChannel", channel)
                        .put("eventId", eventId);
                }
                case "REVIEW_RUN": {
                    String account = in.optString("account", "");
                    String date = in.optString("date", "");
                    validateAccount(account);
                    validateDate(date);
                    return new JSONObject()
                        .put("kind", "REVIEW_RUN")
                        .put("account", account)
                        .put("date", date)
                        .put("eventId", eventId);
                }
                case "SYNC_STATUS": {
                    return new JSONObject()
                        .put("kind", "SYNC_STATUS")
                        .put("eventId", eventId);
                }
                default:
                    return null;
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static PendingIntent make(Context c, String actionKey, int code, JSONObject nav) {
        String pkg = c != null ? c.getPackageName() : "in.azulia.seller";
        Intent intent = new Intent()
            .setClassName(pkg, "in.azulia.seller.MainActivity")
            .setAction("in.azulia.seller.NAV_" + actionKey)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("nav", nav.toString());
        return PendingIntent.getActivity(c, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
