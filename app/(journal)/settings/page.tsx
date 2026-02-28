import APIKeyInput from '@/components/settings/APIKeyInput';
import TradeDateCutoff from '@/components/settings/TradeDateCutoff';

export default function SettingsPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            <div className="space-y-8">
                <TradeDateCutoff />
                <APIKeyInput />
            </div>
        </div>
    );
}
