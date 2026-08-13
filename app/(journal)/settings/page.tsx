import APIKeyInput from '@/components/settings/APIKeyInput';
import TradeDateCutoff from '@/components/settings/TradeDateCutoff';
import AccountSettings from '@/components/settings/AccountSettings';
import MarketDataSettings from '@/components/settings/MarketDataSettings';
import BullMQStatusCard from '@/components/settings/BullMQStatusCard';
import ProviderStatsCard from '@/components/settings/ProviderStatsCard';
import PushNotificationToggle from '@/components/watch/PushNotificationToggle';
import DataManagementSettings from '@/components/settings/DataManagementSettings';

export default function SettingsPage() {
    return (
        <div className="p-4 sm:p-6 space-y-8 w-full">
            <h1 className="hidden sm:block text-3xl font-bold text-foreground mb-8">Settings</h1>

            <div className="space-y-8">
                <AccountSettings />
                <DataManagementSettings />
                <PushNotificationToggle />
                <BullMQStatusCard />
                <ProviderStatsCard />
                <MarketDataSettings />
                <TradeDateCutoff />
                <APIKeyInput />
            </div>
        </div>
    );
}
