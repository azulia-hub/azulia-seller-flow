package in.azulia.seller;

public final class OrderNoticePolicyCheck {
    private static void check(boolean result) { if(!result)throw new AssertionError("Order notice policy regression"); }
    public static void main(String[] args) {
        check(OrderNoticePolicy.event("","Pending",true).equals("new"));
        check(OrderNoticePolicy.event("","Unshipped",false).isEmpty());
        check(OrderNoticePolicy.event("Pending","Unshipped",false).equals("confirmed"));
        check(OrderNoticePolicy.event("PendingAvailability","PartiallyShipped",false).equals("confirmed"));
        check(OrderNoticePolicy.event("Unshipped","Unshipped",true).isEmpty());
        check(OrderNoticePolicy.event("Pending","Canceled",true).isEmpty());
        check(OrderNoticePolicy.fulfillment("").equals("Fulfillment pending"));
        check(OrderNoticePolicy.fulfillment("MFN").equals("FBM"));
        check(OrderNoticePolicy.fulfillment("AFN").equals("FBA"));
        System.out.println("9 notification policy checks passed");
    }
}
