/**
 * SPDX-FileCopyrightText: Copyright (c) 2024-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

import React from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  RadioGroup,
  Radio,
  Divider,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  FormControl,
  FormLabel,
  Card,
  CardBody,
  Badge,
  Tooltip,
  IconButton,
  RangeSlider,
  RangeSliderTrack,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  Switch,
} from "@chakra-ui/react";
import { InfoIcon, CloseIcon } from "@chakra-ui/icons";
import FilterByPropertiesInput from "./propertiesInput";
import { useTranslation } from "./i18n/LanguageContext";
import { DEFAULT_SEARCH_PARAMS } from "./config";

const RangeSliderWithInput = ({ 
  label, 
  minValue, 
  maxValue, 
  min = 0, 
  max = 100, 
  step = 0.1, 
  onMinChange, 
  onMaxChange,
  unit = ""
}) => {
  // Convert string values to numbers, handle empty values specially
  const hasMinValue = minValue !== "" && !isNaN(parseFloat(minValue));
  const hasMaxValue = maxValue !== "" && !isNaN(parseFloat(maxValue));
  
  // If both are empty, don't set any value (let slider use its internal state)
  // If one is set, use it; if the other is empty, use the range boundary
  let sliderValue;
  if (!hasMinValue && !hasMaxValue) {
    // Both empty - don't control the slider, let it be free
    sliderValue = undefined;
  } else {
    const currentMin = hasMinValue ? parseFloat(minValue) : min;
    const currentMax = hasMaxValue ? parseFloat(maxValue) : max;
    sliderValue = [currentMin, currentMax];
  }

  return (
    <FormControl>
      <FormLabel fontSize="sm">{label}</FormLabel>
      <RangeSlider
        value={sliderValue}
        defaultValue={sliderValue === undefined ? [20, 80] : undefined}
        min={min}
        max={max}
        step={step}
        colorScheme="yellow"
        onChange={([newMin, newMax]) => {
          onMinChange(newMin.toString());
          onMaxChange(newMax.toString());
        }}
      >
        <RangeSliderTrack>
          <RangeSliderFilledTrack />
        </RangeSliderTrack>
        <RangeSliderThumb index={0} />
        <RangeSliderThumb index={1} />
      </RangeSlider>
    </FormControl>
  );
};

const FilterSection = ({ title, children, defaultOpen = false, badge = null, onClear = null }) => {
  const { t } = useTranslation();
  return (
  <AccordionItem border="none">
    <AccordionButton px={0} _hover={{ bg: "transparent" }}>
      <HStack flex="1" textAlign="left" justify="space-between">
        <HStack>
          <Text fontSize="sm" fontWeight="semibold">
            {title}
          </Text>
          {badge && (
            <Badge size="sm" colorScheme="yellow">
              {badge}
            </Badge>
          )}
        </HStack>
        <HStack>
          {onClear && (
            <IconButton
              size="xs"
              variant="ghost"
              icon={<CloseIcon />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
              aria-label={t('searchFiltersTitle')}
            />
          )}
          <AccordionIcon />
        </HStack>
      </HStack>
    </AccordionButton>
    <AccordionPanel px={0} pb={4}>
      <VStack spacing={3} align="stretch">
        {children}
      </VStack>
    </AccordionPanel>
  </AccordionItem>
  );
};

const SearchFilters = ({ 
  searchParams, 
  handleChange, 
  setSearchParams, 
  propertiesData,
  onClearAll 
}) => {
  const { t } = useTranslation();
  const hasActiveFilters = Object.entries(searchParams).some(([key, value]) => {
    if (key === 'limit' || key === 'embedding_knn_search_method') return false;
    return value !== "" && value !== null && value !== undefined;
  });

  const clearFileFilters = () => {
    setSearchParams({
      ...searchParams,
      file_name: DEFAULT_SEARCH_PARAMS.file_name,
      exclude_file_name: DEFAULT_SEARCH_PARAMS.exclude_file_name,
      file_extension_include: DEFAULT_SEARCH_PARAMS.file_extension_include,
      file_extension_exclude: DEFAULT_SEARCH_PARAMS.file_extension_exclude,
    });
  };

  const clearPathFilters = () => {
    setSearchParams({
      ...searchParams,
      search_path: DEFAULT_SEARCH_PARAMS.search_path,
      exclude_search_path: DEFAULT_SEARCH_PARAMS.exclude_search_path,
      search_in_scene: DEFAULT_SEARCH_PARAMS.search_in_scene,
      filter_url_regexp: DEFAULT_SEARCH_PARAMS.filter_url_regexp,
    });
  };

  const clearPropertyFilters = () => {
    setSearchParams({
      ...searchParams,
      filter_by_properties: DEFAULT_SEARCH_PARAMS.filter_by_properties,
      vision_metadata: DEFAULT_SEARCH_PARAMS.vision_metadata,
      filter_by_tags: DEFAULT_SEARCH_PARAMS.filter_by_tags,
    });
  };

  const clearFileSizeFilters = () => {
    setSearchParams({
      ...searchParams,
      file_size_greater_than: DEFAULT_SEARCH_PARAMS.file_size_greater_than,
      file_size_less_than: DEFAULT_SEARCH_PARAMS.file_size_less_than,
    });
  };

  const clearDimensionFilters = () => {
    setSearchParams({
      ...searchParams,
      min_bbox_x: DEFAULT_SEARCH_PARAMS.min_bbox_x,
      min_bbox_y: DEFAULT_SEARCH_PARAMS.min_bbox_y,
      min_bbox_z: DEFAULT_SEARCH_PARAMS.min_bbox_z,
      max_bbox_x: DEFAULT_SEARCH_PARAMS.max_bbox_x,
      max_bbox_y: DEFAULT_SEARCH_PARAMS.max_bbox_y,
      max_bbox_z: DEFAULT_SEARCH_PARAMS.max_bbox_z,
      bbox_use_scaled_dimensions: DEFAULT_SEARCH_PARAMS.bbox_use_scaled_dimensions,
    });
  };

  const clearDateFilters = () => {
    setSearchParams({
      ...searchParams,
      created_before: DEFAULT_SEARCH_PARAMS.created_before,
      created_after: DEFAULT_SEARCH_PARAMS.created_after,
      modified_before: DEFAULT_SEARCH_PARAMS.modified_before,
      modified_after: DEFAULT_SEARCH_PARAMS.modified_after,
    });
  };

  const clearUserFilters = () => {
    setSearchParams({
      ...searchParams,
      created_by: "",
      exclude_created_by: "",
      modified_by: "",
      exclude_modified_by: ""
    });
  };

  const clearAdvancedFilters = () => {
    setSearchParams({
      ...searchParams,
      similarity_threshold: "",
      cutoff_threshold: ""
    });
  };

  const getActiveFilterCount = (filterKeys) => {
    return filterKeys.filter(key => {
      const value = searchParams[key];
      return value !== "" && value !== null && value !== undefined;
    }).length;
  };

  return (
    <Card bg="gray.800" borderColor="gray.600" h="fit-content" minW="360px">
      <CardBody p={4}>
        <VStack spacing={4} align="stretch">
          {/* Header */}
          <HStack justify="space-between">
            <Text fontSize="lg" fontWeight="bold">
              {t('searchFiltersTitle')}
            </Text>
            {hasActiveFilters && (
              <IconButton
                size="sm"
                variant="ghost"
                icon={<CloseIcon />}
                onClick={onClearAll}
                aria-label={t('searchFiltersTitle')}
                colorScheme="red"
              />
            )}
          </HStack>

          <Divider />

          {/* Filter Sections */}
          <Accordion allowMultiple defaultIndex={[]}>
            {/* File & Name Filters (Most Common - First) */}
            <FilterSection
              title={t('fileNameFilters')}
              badge={getActiveFilterCount(['file_name', 'exclude_file_name', 'file_extension_include', 'file_extension_exclude']) || null}
              onClear={clearFileFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('fileName')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="file_name"
                  value={searchParams.file_name}
                  onChange={handleChange}
                  placeholder={t('fileNamePlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('excludeFileNames')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="exclude_file_name"
                  value={searchParams.exclude_file_name}
                  onChange={handleChange}
                  placeholder={t('excludePatternsPlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('includeExtensions')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="file_extension_include"
                  value={searchParams.file_extension_include}
                  onChange={handleChange}
                  placeholder={t('includeExtensionsPlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('excludeExtensions')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="file_extension_exclude"
                  value={searchParams.file_extension_exclude}
                  onChange={handleChange}
                  placeholder={t('excludeExtensionsPlaceholder')}
                />
              </FormControl>

            </FilterSection>

            {/* Path & Location Filters (Second) */}
            <FilterSection
              title={t('pathLocationFilters')}
              badge={getActiveFilterCount(['search_path', 'exclude_search_path', 'search_in_scene', 'filter_url_regexp']) || null}
              onClear={clearPathFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('searchPath')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="search_path"
                  value={searchParams.search_path}
                  onChange={handleChange}
                  placeholder={t('searchPathPlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('excludeSearchPath')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="exclude_search_path"
                  value={searchParams.exclude_search_path}
                  onChange={handleChange}
                  placeholder={t('excludePathsPlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('searchInScene')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="search_in_scene"
                  value={searchParams.search_in_scene}
                  onChange={handleChange}
                  placeholder={t('fullSceneUrl')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">
                  {t('urlRegexFilter')}
                  <Tooltip label={t('luceneRegexTooltip')}>
                    <InfoIcon boxSize={3} ml={1} />
                  </Tooltip>
                </FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="filter_url_regexp"
                  value={searchParams.filter_url_regexp}
                  onChange={handleChange}
                  placeholder={t('regexPattern')}
                />
              </FormControl>
            </FilterSection>

            {/* Content & Properties Filters (Third) */}
            <FilterSection
              title={t('contentPropertiesFilters')}
              badge={getActiveFilterCount(['filter_by_properties', 'vision_metadata']) || null}
              onClear={clearPropertyFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('usdProperties')}</FormLabel>
                <FilterByPropertiesInput
                  value={searchParams.filter_by_properties}
                  onChange={handleChange}
                  apiData={propertiesData}
                  name="filter_by_properties"
                  size="sm"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('visionMetadata')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="vision_metadata"
                  value={searchParams.vision_metadata}
                  onChange={handleChange}
                  placeholder={t('aiGeneratedTags')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('tags')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="filter_by_tags"
                  value={searchParams.filter_by_tags}
                  onChange={handleChange}
                  placeholder={t('tagsPlaceholder')}
                />
              </FormControl>
            </FilterSection>

            {/* File Size Filters (Fourth) */}
            <FilterSection
              title={t('fileSizeFilters')}
              badge={getActiveFilterCount(['file_size_greater_than', 'file_size_less_than']) || null}
              onClear={clearFileSizeFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('minimumSize')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="file_size_greater_than"
                  value={searchParams.file_size_greater_than}
                  onChange={handleChange}
                  placeholder={t('minimumSizePlaceholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('maximumSize')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="file_size_less_than"
                  value={searchParams.file_size_less_than}
                  onChange={handleChange}
                  placeholder={t('maximumSizePlaceholder')}
                />
              </FormControl>
            </FilterSection>

            {/* Object Dimension Filters (Fifth) */}
            <FilterSection
              title={t('objectDimensionFilters')}
              badge={getActiveFilterCount(['min_bbox_x', 'min_bbox_y', 'min_bbox_z', 'max_bbox_x', 'max_bbox_y', 'max_bbox_z']) || null}
              onClear={clearDimensionFilters}
            >
              <FormControl>
                <HStack justify="space-between" align="center">
                  <FormLabel fontSize="sm" mb={0}>{t('useScaledDimensions')}</FormLabel>
                  <Switch
                    size="sm"
                    isChecked={searchParams.bbox_use_scaled_dimensions}
                    onChange={(e) => setSearchParams({
                      ...searchParams,
                      bbox_use_scaled_dimensions: e.target.checked
                    })}
                  />
                </HStack>
                <Text fontSize="xs" color="gray.400" mt={1}>
                  {searchParams.bbox_use_scaled_dimensions 
                    ? t('scaledDimensionsOn')
                    : t('scaledDimensionsOff')}
                </Text>
              </FormControl>

              <Divider />

              {/* X Dimension */}
              <FormControl>
                <FormLabel fontSize="sm">{t('xDimensionRange')}</FormLabel>
                <HStack spacing={2}>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="min_bbox_x"
                      value={searchParams.min_bbox_x}
                      onChange={handleChange}
                      placeholder={t('minX')}
                    />
                  </Box>
                  <Text fontSize="sm" color="gray.400">{t('to')}</Text>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="max_bbox_x"
                      value={searchParams.max_bbox_x}
                      onChange={handleChange}
                      placeholder={t('to')}
                    />
                  </Box>
                </HStack>
              </FormControl>

              {/* Y Dimension */}
              <FormControl>
                <FormLabel fontSize="sm">{t('yDimensionRange')}</FormLabel>
                <HStack spacing={2}>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="min_bbox_y"
                      value={searchParams.min_bbox_y}
                      onChange={handleChange}
                      placeholder={t('minY')}
                    />
                  </Box>
                  <Text fontSize="sm" color="gray.400">{t('to')}</Text>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="max_bbox_y"
                      value={searchParams.max_bbox_y}
                      onChange={handleChange}
                      placeholder={t('to')}
                    />
                  </Box>
                </HStack>
              </FormControl>

              {/* Z Dimension */}
              <FormControl>
                <FormLabel fontSize="sm">{t('zDimensionRange')}</FormLabel>
                <HStack spacing={2}>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="min_bbox_z"
                      value={searchParams.min_bbox_z}
                      onChange={handleChange}
                      placeholder={t('minZ')}
                    />
                  </Box>
                  <Text fontSize="sm" color="gray.400">{t('to')}</Text>
                  <Box flex={1}>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      name="max_bbox_z"
                      value={searchParams.max_bbox_z}
                      onChange={handleChange}
                      placeholder={t('to')}
                    />
                  </Box>
                </HStack>
              </FormControl>
            </FilterSection>

            {/* Date Filters (Sixth) */}
            <FilterSection
              title={t('dateFilters')}
              badge={getActiveFilterCount(['created_before', 'created_after', 'modified_before', 'modified_after']) || null}
              onClear={clearDateFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('createdAfter')}</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  name="created_after"
                  value={searchParams.created_after}
                  onChange={handleChange}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('createdBefore')}</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  name="created_before"
                  value={searchParams.created_before}
                  onChange={handleChange}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('modifiedAfter')}</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  name="modified_after"
                  value={searchParams.modified_after}
                  onChange={handleChange}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('modifiedBefore')}</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  name="modified_before"
                  value={searchParams.modified_before}
                  onChange={handleChange}
                />
              </FormControl>
            </FilterSection>


            {/* User Filters (Seventh) */}
            <FilterSection
              title={t('userFilters')}
              badge={getActiveFilterCount(['created_by', 'exclude_created_by', 'modified_by', 'exclude_modified_by']) || null}
              onClear={clearUserFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">{t('createdBy')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="created_by"
                  value={searchParams.created_by}
                  onChange={handleChange}
                  placeholder={t('usernameOrEmail')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('excludeCreatedBy')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="exclude_created_by"
                  value={searchParams.exclude_created_by}
                  onChange={handleChange}
                  placeholder={t('excludeUsernameOrEmail')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('modifiedBy')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="modified_by"
                  value={searchParams.modified_by}
                  onChange={handleChange}
                  placeholder={t('usernameOrEmail')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">{t('excludeModifiedBy')}</FormLabel>
                <Input
                  size="sm"
                  autoComplete="off"
                  name="exclude_modified_by"
                  value={searchParams.exclude_modified_by}
                  onChange={handleChange}
                  placeholder={t('excludeUsernameOrEmail')}
                />
              </FormControl>
            </FilterSection>

            {/* Advanced Filters (Eighth) */}
            <FilterSection
              title={t('advancedFilters')}
              badge={getActiveFilterCount(['similarity_threshold', 'cutoff_threshold']) || null}
              onClear={clearAdvancedFilters}
            >
              <FormControl>
                <FormLabel fontSize="sm">
                  {t('similarityThreshold')}
                  <Tooltip label={t('similarityThresholdHelp')}>
                    <InfoIcon boxSize={3} ml={1} />
                  </Tooltip>
                </FormLabel>
                <Input
                  size="sm"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  name="similarity_threshold"
                  value={searchParams.similarity_threshold}
                  onChange={handleChange}
                  placeholder="0.5"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">
                  {t('cutoffThreshold')}
                  <Tooltip label={t('cutoffThresholdHelp')}>
                    <InfoIcon boxSize={3} ml={1} />
                  </Tooltip>
                </FormLabel>
                <Input
                  size="sm"
                  type="number"
                  step="0.1"
                  min="0"
                  name="cutoff_threshold"
                  value={searchParams.cutoff_threshold}
                  onChange={handleChange}
                  placeholder="0.1"
                />
              </FormControl>
            </FilterSection>

            {/* Search Settings */}
            <FilterSection title={t('searchSettings')}>
              <FormControl>
                <FormLabel fontSize="sm">{t('resultsPerPage')}</FormLabel>
                <Select
                  size="sm"
                  name="limit"
                  value={searchParams.limit}
                  onChange={handleChange}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">
                  {t('searchMethod')}
                  <Tooltip label={t('searchMethodHelp')}>
                    <InfoIcon boxSize={3} ml={1} />
                  </Tooltip>
                </FormLabel>
                <RadioGroup
                  value={searchParams.embedding_knn_search_method}
                  onChange={(value) =>
                    setSearchParams({
                      ...searchParams,
                      embedding_knn_search_method: value,
                    })
                  }
                >
                  <VStack align="start" spacing={2}>
                    <Radio value="exact" size="sm">
                      {t('exact')}
                    </Radio>
                    <Radio value="approximate" size="sm">
                      {t('approximate')}
                    </Radio>
                  </VStack>
                </RadioGroup>
              </FormControl>
            </FilterSection>
          </Accordion>
        </VStack>
      </CardBody>
    </Card>
  );
};

export default React.memo(SearchFilters);