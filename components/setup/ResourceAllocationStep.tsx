"use client";

import React, { useState } from "react";
import { Button } from "../ui/Button";
import { Cpu, Layout, HardDrive, DollarSign, AlertTriangle } from "lucide-react";

interface HardwareProfile {
  cpu_cores: number;
  ram_total_gb: number;
  disk_free_gb: number;
}

interface ModelOption {
  id: string;
  display_name: string;
  ollama_tag: string;
  download_gb: number;
  memory_gb: number;
}

interface ResourceConfig {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  electricityRate: number;
}

interface ResourceAllocationStepProps {
  hardwareProfile: HardwareProfile;
  selectedModel: ModelOption;
  onNext: (config: ResourceConfig) => void;
  onBack: () => void;
}

export const ResourceAllocationStep: React.FC<ResourceAllocationStepProps> = ({
  hardwareProfile,
  selectedModel,
  onNext,
  onBack,
}) => {
  // Recommendations based on selected model
  // Cores: recommend 50% cores (min 1)
  const recommendedCores = Math.max(Math.round(hardwareProfile.cpu_cores / 2), 1);
  
  // Memory: recommend ~1.5x model memory_gb (rounded up), bound by total ram
  const recommendedMemory = Math.min(
    Math.max(Math.ceil(selectedModel.memory_gb * 1.5), 4),
    Math.floor(hardwareProfile.ram_total_gb)
  );

  // Storage: recommend ~5x download size (min 15GB), bound by free disk space
  const recommendedDisk = Math.min(
    Math.max(Math.ceil(selectedModel.download_gb * 5), 15),
    Math.floor(hardwareProfile.disk_free_gb)
  );

  const [cpuCores, setCpuCores] = useState(recommendedCores);
  const [memoryGb, setMemoryGb] = useState(recommendedMemory);
  const [diskGb, setDiskGb] = useState(recommendedDisk);
  const [electricityRate, setElectricityRate] = useState(0.12);

  const handleNext = () => {
    onNext({
      cpuCores,
      memoryGb,
      diskGb,
      electricityRate,
    });
  };

  // Warnings
  const ramTooLow = memoryGb < selectedModel.memory_gb;
  const diskTooLow = diskGb < selectedModel.download_gb + 2.0; // download size + 2GB database buffer

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">Allocate Local Resources</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">
        Control how much CPU, memory, and storage PreceptaAI is allowed to use on your machine.
      </p>

      {/* Model Footprint Banner */}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg mb-5 flex justify-between items-center text-xs">
        <div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">Selected Model:</span>{" "}
          <span className="font-bold text-primary">{selectedModel.display_name}</span>
        </div>
        <div className="flex gap-3 text-gray-500 font-semibold text-[10px]">
          <span>RAM req: {selectedModel.memory_gb} GB</span>
          <span>Disk req: {selectedModel.download_gb} GB</span>
        </div>
      </div>

      <div className="space-y-5 mb-6">
        {/* CPU Cores */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> CPU Cores Limit</span>
            <span className="text-primary font-bold">
              {cpuCores} Cores / {hardwareProfile.cpu_cores} Total (Rec: {recommendedCores})
            </span>
          </div>
          <input
            type="range"
            min="1"
            max={hardwareProfile.cpu_cores}
            step="1"
            value={cpuCores}
            onChange={(e) => setCpuCores(parseInt(e.target.value))}
            className="slider"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            More cores speed up inference, but leaving cores free keeps other apps responsive.
          </p>
        </div>

        {/* RAM Limit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><Layout className="h-3.5 w-3.5" /> Memory Limit (RAM)</span>
            <span className="text-primary font-bold">
              {memoryGb} GB / {hardwareProfile.ram_total_gb.toFixed(0)} GB Total (Rec: {recommendedMemory})
            </span>
          </div>
          <input
            type="range"
            min="2"
            max={Math.floor(hardwareProfile.ram_total_gb)}
            step="1"
            value={memoryGb}
            onChange={(e) => setMemoryGb(parseInt(e.target.value))}
            className="slider"
          />
          {ramTooLow ? (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/20 p-1.5 rounded border border-amber-100 dark:border-amber-900 mt-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Allocated memory is below model's VRAM requirement ({selectedModel.memory_gb} GB)! Model may run extremely slowly or fail to load.
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Allocated memory for model loading. {selectedModel.display_name} requires at least {selectedModel.memory_gb} GB.
            </p>
          )}
        </div>

        {/* Storage limit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Storage Limit</span>
            <span className="text-primary font-bold">
              {diskGb} GB / {hardwareProfile.disk_free_gb.toFixed(0)} GB Free (Rec: {recommendedDisk})
            </span>
          </div>
          <input
            type="range"
            min="5"
            max={Math.floor(hardwareProfile.disk_free_gb)}
            step="5"
            value={diskGb}
            onChange={(e) => setDiskGb(parseInt(e.target.value))}
            className="slider"
          />
          {diskTooLow ? (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/20 p-1.5 rounded border border-amber-100 dark:border-amber-900 mt-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Allocated storage is close to or below model size ({selectedModel.download_gb} GB). Leave extra room for workflow database records and vault files.
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Maximum disk space allocated for model storage, SQLite data, and files in the Object Vault.
            </p>
          )}
        </div>

        {/* Electricity Rate */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Local Electricity Rate</span>
            <span className="text-primary font-bold">${electricityRate.toFixed(3)} per kWh</span>
          </div>
          <input
            type="number"
            min="0"
            max="2"
            step="0.005"
            value={electricityRate}
            onChange={(e) => setElectricityRate(parseFloat(e.target.value) || 0)}
            className="input text-sm py-1.5"
          />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Used to calculate accurate local running costs vs cloud provider pricing benchmarks.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onBack} variant="secondary" className="flex-1 justify-center">
          Back
        </Button>
        <Button onClick={handleNext} className="flex-1 justify-center">
          Continue to Summary
        </Button>
      </div>
    </div>
  );
};
