import { useEffect, useState, useCallback } from 'react';
import {
  llamaService,
  LlamaServiceState,
  GenerateCompletionParams,
  GenerateCompletionResult,
} from '../services/llamaService';

export function useLlama() {
  const [state, setState] = useState<LlamaServiceState>(llamaService.getState());

  useEffect(() => {
    const unsubscribe = llamaService.subscribe(newState => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  const loadModel = useCallback(
    async (modelId: string, onProgress?: (progressPercent: number) => void) => {
      return llamaService.loadModel(modelId, onProgress);
    },
    []
  );

  const unloadModel = useCallback(async () => {
    return llamaService.unloadModel();
  }, []);

  const generateCompletion = useCallback(
    async (params: GenerateCompletionParams): Promise<GenerateCompletionResult> => {
      return llamaService.generateCompletion(params);
    },
    []
  );

  const stopGeneration = useCallback(async () => {
    return llamaService.stopGeneration();
  }, []);

  return {
    ...state,
    loadModel,
    unloadModel,
    generateCompletion,
    stopGeneration,
  };
}
