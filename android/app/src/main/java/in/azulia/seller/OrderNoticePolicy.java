package in.azulia.seller;

/** Source status observations, independent of Android notification APIs and money. */
final class OrderNoticePolicy {
    static String event(String previous,String current,boolean newPurchase) {
        boolean active=current.equals("Pending") || current.equals("PendingAvailability") || current.equals("Unshipped") || current.equals("PartiallyShipped") || current.equals("Shipped");
        if(!active)return "";
        if(previous.isEmpty())return newPurchase?"new":"";
        boolean pending=previous.equals("Pending") || previous.equals("PendingAvailability");
        return pending && (current.equals("Unshipped") || current.equals("PartiallyShipped") || current.equals("Shipped"))?"confirmed":"";
    }
    static String fulfillment(String channel) {
        return channel.equals("AFN")?"FBA":channel.equals("MFN")?"FBM":"Fulfillment pending";
    }
}
