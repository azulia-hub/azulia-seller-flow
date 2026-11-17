package in.azulia.seller;

/** Capabilities used by the bundled sync engine; interactive account/UI actions stay excluded. */
final class BackgroundCapabilities {
    static boolean allows(String action) {
        if(action==null)return false;
        return action.startsWith("source.") || action.startsWith("workspace.") || action.startsWith("engine.")
            || action.startsWith("background.") || action.equals("reading.status") || action.equals("session.status")
            || action.equals("amazon.request") || action.equals("reviews.submit") || action.equals("reviews.notify")
            || action.equals("inventory.notify");
    }
}
