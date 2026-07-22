import APIKeyInput from '@/components/settings/APIKeyInput';
import TradeDateCutoff from '@/components/settings/TradeDateCutoff';
import AccountSettings from '@/components/settings/AccountSettings';
import MarketDataSettings from '@/components/settings/MarketDataSettings';

export default function SettingsPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            <div className="space-y-8">
                <AccountSettings />
                <MarketDataSettings />
                <TradeDateCutoff />
                <APIKeyInput />
            </div>
        </div>
    );
}
