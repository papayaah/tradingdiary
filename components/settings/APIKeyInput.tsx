'use client';



'use client';

import {
    AIProviderSelector,
    UsageStats,
    useAIManagementContextOptional
} from '@/packages/ai-connect/src/components';
import { defaultPreset } from '@/packages/ai-connect/src/presets/default';
import { AIProviderConfig } from '@/packages/ai-connect/src/types';

export default function APIKeyInput() {
    const aiContext = useAIManagementContextOptional();

    const handleProviderSelect = (config: AIProviderConfig) => {
        aiContext?.setConfig(config);
    };

    if (!aiContext) {
        return <div>Error: AI Context not found. Please wrap your app in AIManagementProvider.</div>;
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div className="bg-card text-card-foreground p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-medium mb-6">AI Configuration</h3>

                <AIProviderSelector
                    onProviderSelect={handleProviderSelect}
                    enabledProviders={['openrouter']}
                    defaultProvider="custom-llm"
                    preset={defaultPreset}
                    showCostComparison={false}
                />
            </div>

            <div className="bg-card text-card-foreground p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-medium mb-6">Usage & Costs</h3>
                <UsageStats
                    stats={aiContext.usageStats}
                    onReset={aiContext.resetUsageStats}
                    preset={defaultPreset}
                />
            </div>
        </div>
    );
}
