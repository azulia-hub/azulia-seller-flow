package in.azulia.seller;

public final class BackgroundCapabilitiesCheck {
    public static void main(String[] args) {
        for(String action:new String[]{"reviews.notify","reviews.submit","inventory.notify","source.begin","workspace.get","engine.completed","background.read","reading.status","session.status","amazon.request","ads.status","ads.cycle","ads.chunk","ads.accept","ads.reject"})
            if(!BackgroundCapabilities.allows(action))throw new AssertionError("Required engine capability rejected: "+action);
        for(String action:new String[]{"session.connect","session.forget","live.configure","ui.theme","sync.request","reviews.delete","reviews.notify.extra","notify","","ads.import","ads.forget","ads.sync","ads.index","ads.campaign.update"})
            if(BackgroundCapabilities.allows(action))throw new AssertionError("Interactive/unknown capability allowed: "+action);
        if(BackgroundCapabilities.allows(null))throw new AssertionError("Null capability allowed.");
        System.out.println("Background capability checks passed.");
    }
}
