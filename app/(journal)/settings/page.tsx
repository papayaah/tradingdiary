import APIKeyInput from '@/components/settings/APIKeyInput';

export default function SettingsPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            <div className="space-y-8">
                <APIKeyInput />

                {/* Other settings can go here */}
            </div>
        </div>
    );
}
