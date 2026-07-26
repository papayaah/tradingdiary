import APIKeyInput from '@/components/settings/APIKeyInput';
import TradeDateCutoff from '@/components/settings/TradeDateCutoff';
import AccountSettings from '@/components/settings/AccountSettings';
import MarketDataSettings from '@/components/settings/MarketDataSettings';
import BullMQStatusCard from '@/components/settings/BullMQStatusCard';
import PushNotificationToggle from '@/components/watch/PushNotificationToggle';

export default function SettingsPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            <div className="space-y-8">
                <AccountSettings />
                <PushNotificationToggle />
                <BullMQStatusCard />
                <MarketDataSettings />
                <TradeDateCutoff />
                <APIKeyInput />
            </div>
        </div>
    );
}
