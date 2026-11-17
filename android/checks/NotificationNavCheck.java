package in.azulia.seller;

import org.json.JSONObject;

public final class NotificationNavCheck {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void assertThrows(Runnable r, String message) {
        try {
            r.run();
            throw new AssertionError("Expected exception for: " + message);
        } catch (IllegalArgumentException e) {
            // expected
        } catch (Exception e) {
            throw new AssertionError("Expected IllegalArgumentException but got: " + e);
        }
    }

    public static void main(String[] args) {
        String validAccount = "a".repeat(64);
        String validOrderId = "123-1234567-1234567";

        // Account validation
        NotificationNav.validateAccount(validAccount);
        assertThrows(() -> NotificationNav.validateAccount(null), "null account");
        assertThrows(() -> NotificationNav.validateAccount("short"), "short account");
        assertThrows(() -> NotificationNav.validateAccount("z".repeat(64)), "non-hex account");

        // OrderId validation
        NotificationNav.validateOrderId(validOrderId);
        assertThrows(() -> NotificationNav.validateOrderId(null), "null orderId");
        assertThrows(() -> NotificationNav.validateOrderId("12-1234567-1234567"), "malformed prefix");
        assertThrows(() -> NotificationNav.validateOrderId("123-123456-1234567"), "malformed segment");
        assertThrows(() -> NotificationNav.validateOrderId("invalid"), "non-matching orderId");

        // Date validation for reviewRun
        NotificationNav.validateDate("2026-11-17");
        assertThrows(() -> NotificationNav.validateDate("not-a-date"), "malformed date");
        assertThrows(() -> NotificationNav.validateDate("2026-02-30"), "impossible calendar date");
        assertThrows(() -> NotificationNav.validateDate("2026-13-01"), "invalid month");
        assertThrows(() -> NotificationNav.validateDate("1899-01-01"), "out of bounds year");

        // SKU validation for inventoryRestock
        assertThrows(() -> {
            try {
                NotificationNav.inventoryRestock(null, validAccount, "", "AMAZON", "FBA");
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, "empty sku");
        assertThrows(() -> {
            try {
                NotificationNav.inventoryRestock(null, validAccount, "x".repeat(181), "AMAZON", "FBA");
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, "oversized sku");
        assertThrows(() -> {
            try {
                NotificationNav.inventoryRestock(null, validAccount, "sku\nmalicious", "AMAZON", "FBA");
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, "sku with newline/control characters");

        // validateAndSanitize checks
        JSONObject sanitizedOrder = NotificationNav.validateAndSanitize(
            "{\"kind\":\"ORDER_DETAIL\",\"account\":\"" + validAccount + "\",\"orderId\":\"" + validOrderId + "\",\"extra\":\"dropMe\"}"
        );
        check(sanitizedOrder != null, "sanitizedOrder not null");
        check("ORDER_DETAIL".equals(sanitizedOrder.optString("kind")), "kind matches");
        check(validAccount.equals(sanitizedOrder.optString("account")), "account matches");
        check(validOrderId.equals(sanitizedOrder.optString("orderId")), "orderId matches");
        check(!sanitizedOrder.has("extra"), "extra field stripped");
        check(sanitizedOrder.has("eventId"), "eventId generated");

        // Invalid payload returns null
        check(NotificationNav.validateAndSanitize(null) == null, "null input returns null");
        check(NotificationNav.validateAndSanitize("not json") == null, "invalid json returns null");
        check(NotificationNav.validateAndSanitize("{\"kind\":\"UNKNOWN\"}") == null, "unknown kind returns null");
        check(NotificationNav.validateAndSanitize("{\"kind\":\"REVIEW_RUN\",\"account\":\"" + validAccount + "\",\"date\":\"2026-02-30\"}") == null, "invalid calendar date returns null");
        check(NotificationNav.validateAndSanitize("{\"kind\":\"ORDER_DETAIL\",\"account\":\"bad\",\"orderId\":\"" + validOrderId + "\"}") == null, "bad account returns null");

        // Request codes distinct
        check(NotificationNav.RC_ORDER != NotificationNav.RC_REFUND, "RC_ORDER != RC_REFUND");
        check(NotificationNav.RC_REFUND != NotificationNav.RC_INVENTORY, "RC_REFUND != RC_INVENTORY");
        check(NotificationNav.RC_INVENTORY != NotificationNav.RC_REVIEW, "RC_INVENTORY != RC_REVIEW");
        check(NotificationNav.RC_REVIEW != NotificationNav.RC_SYNC, "RC_REVIEW != RC_SYNC");

        System.out.println("NotificationNavCheck passed.");
    }
}
