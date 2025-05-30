/*************************************************************************************************

Welcome to Baml! To use this generated code, please run one of the following:

$ npm install @boundaryml/baml
$ yarn add @boundaryml/baml
$ pnpm add @boundaryml/baml

*************************************************************************************************/

// This file was generated by BAML: do not edit it. Instead, edit the BAML
// files and re-generate this code.
//
/* eslint-disable */
// tslint:disable
// @ts-nocheck
// biome-ignore format: autogenerated code
import type { Image, Audio } from "@boundaryml/baml"

/**
 * Recursively partial type that can be null.
 *
 * @deprecated Use types from the `partial_types` namespace instead, which provides type-safe partial implementations
 * @template T The type to make recursively partial.
 */
export type RecursivePartialNull<T> = T extends object
    ? { [P in keyof T]?: RecursivePartialNull<T[P]> }
    : T | null;

export interface Checked<T,CheckName extends string = string> {
    value: T,
    checks: Record<CheckName, Check>,
}


export interface Check {
    name: string,
    expr: string
    status: "succeeded" | "failed"
}

export function all_succeeded<CheckName extends string>(checks: Record<CheckName, Check>): boolean {
    return get_checks(checks).every(check => check.status === "succeeded")
}

export function get_checks<CheckName extends string>(checks: Record<CheckName, Check>): Check[] {
    return Object.values(checks)
}
export enum AllowedTypes {
  UserInput = "UserInput",
  AssisantMessage = "AssisantMessage",
  UpdateEstimateRequest = "UpdateEstimateRequest",
  UpdateEstimateResponse = "UpdateEstimateResponse",
  PatchEstimateRequest = "PatchEstimateRequest",
  PatchEstimateResponse = "PatchEstimateResponse",
}

export enum PatchOperation {
  Add = "Add",
  Remove = "Remove",
  Replace = "Replace",
}

export interface AssisantMessage {
  message: string
  
}

export interface BamlChatThread {
  events: Event[]
  
}

export interface ConstructionProjectData {
  project_description: string
  estimated_total_min?: number | null
  estimated_total_max?: number | null
  estimated_timeline_days?: number | null
  key_considerations: string[]
  confidence_level: string
  estimate_items: EstimateLineItem[]
  next_steps: string[]
  missing_information: string[]
  key_risks: string[]
  
}

export interface EstimateLineItem {
  uid: string
  description: string
  category: string
  subcategory?: string | null
  cost_range_min: number
  cost_range_max: number
  unit?: string | null
  quantity?: number | null
  assumptions?: string | null
  confidence_score?: string | null
  notes?: string | null
  
}

export interface Event {
  type: AllowedTypes
  data: UserInput | AssisantMessage | UpdateEstimateRequest | UpdateEstimateResponse | PatchEstimateRequest | PatchEstimateResponse
  
}

export interface InputFile {
  name: string
  type: string
  description?: string | null
  content?: string | null
  download_url?: string | null
  image_data?: Image | null
  audio_data?: Audio | null
  
}

export interface KeyFrame {
  filename: string
  timestamp_s: number
  description: string
  
}

export interface Patch {
  json_path: string
  operation: PatchOperation
  new_value?: string | null | EstimateLineItem
  
}

export interface PatchEstimateRequest {
  patches: Patch[]
  
}

export interface PatchEstimateResponse {
  patch_results: PatchResult[]
  
}

export interface PatchResult {
  success: boolean
  error_message?: string | null
  
}

export interface ResponseEvent {
  type: AllowedTypes
  data: AssisantMessage | UpdateEstimateRequest | PatchEstimateRequest
  
}

export interface UpdateEstimateRequest {
  changes_to_make: string
  
}

export interface UpdateEstimateResponse {
  success: boolean
  error_message: string
  
}

export interface UserInput {
  message: string
  
}

export interface VideoAnalysis {
  detailed_description: string
  key_frames: KeyFrame[]
  
}
