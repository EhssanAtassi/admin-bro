import { useState, useCallback, useEffect } from 'react'
import { AxiosResponse } from 'axios'
import flat from 'flat'
import ApiClient from '../utils/api-client'
import RecordJSON from '../../backend/decorators/record-json.interface'
import recordToFormData from '../components/actions/record-to-form-data'
import useNotice from './use-notice'
import { RecordActionResponse } from '../../backend/actions/action.interface'
import mergeRecordResponse from '../utils/merge-record-response'

const api = new ApiClient()

/**
 * Result of useRecord hook
 *
 * @memberof useRecord
 * @alias UseRecordResult
 */
export type UseRecordResult = {
  /**
   * recordJSON instance for given resource.
   */
  record: RecordJSON;
  /**
   * Function compatible with onChange method supported by all the components wrapped by
   * {@link BasePropertyComponent}.
   */
  handleChange: (propertyOrRecord: string | RecordJSON, value?: any) => void;
  /**
   * Triggers submission of the record. Returns a promise.
   * If custom params are given as an argument - they are merged
   * to the payload.
   */
  submit: (customParams?: Record<string, string>) => Promise<AxiosResponse<RecordActionResponse>>;
  /**
   * Flag indicates loading.
   */
  loading: boolean;

  /**
   * Upload progress
   */
  progress: number;
}

/**
 * A powerful, hook which allows you to manage an entire record of given type.
 *
 * Take a look of creating a component which renders form for some non-existing record.
 * Form have name and surname fields. After clicking "save" user will create a new record.
 * Consecutive calls will update it.
 *
 * ```javascript
 * import { BasePropertyComponent, useRecord, Box, useTranslation } from 'admin-bro'
 *
 * const MyRecordActionComponent = (props) => {
 *   const { record: initialRecord, resource, action } = props
 *
 *   const { record, handleChange, submit } = useRecord(initialRecord, resource.id)
 *   const { translateButton } = useTranslation()
 *
 *   const nameProperty = resource.editProperties.find((property) => property.name === 'name')
 *   const surnameProperty = resource.editProperties.find((property) => property.name === 'surname')
 *
 *   const handleSubmit = (event) => {
 *     submit().then(() => {
 *        // do something
 *     })
 *   }
 *
 *   return (
 *     <Box
 *       as="form"
 *       onSubmit={handleSubmit}
 *     >
 *       <BasePropertyComponent
 *         where="edit"
 *         onChange={handleChange}
 *         property={nameProperty}
 *         resource={resource}
 *         record={record}
 *       />
 *       <BasePropertyComponent
 *         where="edit"
 *         onChange={handleChange}
 *         property={surnameProperty}
 *         resource={resource}
 *         record={record}
 *       />
 *       <Button variant="primary" size="lg">
 *         {translateButton('save', resource.id)}
 *       </Button>
 *     </Box>
 *   )
 * }
 * export default MyRecordActionComponent
 * ```
 *
 * Returns {@link UseRecordResult}.
 *
 * @subcategory Hooks
 * @component
 */
export const useRecord = (
  initialRecord: RecordJSON | undefined,
  resourceId: string,
): UseRecordResult => {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [record, setRecord] = useState<RecordJSON>({
    ...initialRecord,
    params: initialRecord?.params ?? {},
    errors: initialRecord?.errors ?? {},
    populated: initialRecord?.populated ?? {},
  } as RecordJSON)

  const onNotice = useNotice()

  useEffect(() => {
    if (initialRecord) {
      setRecord(initialRecord)
    }
  }, [initialRecord])

  const handleChange = useCallback((
    propertyOrRecord: RecordJSON | string,
    value?: any,
    incomingRecord?: RecordJSON,
  ): void => {
    if (
      typeof value === 'undefined'
      && !(typeof propertyOrRecord === 'string')
      && propertyOrRecord.params
    ) {
      setRecord(propertyOrRecord)
    } else {
      setRecord((prev) => {
        const key = propertyOrRecord as string
        const inflated = flat.unflatten(prev.params) as Record<string, any>
        let populatedModified = false
        const populatedCopy = { ...prev.populated }
        if (!value) {
          delete inflated[key]
          if (key in populatedCopy) {
            delete populatedCopy[key]
            populatedModified = true
          }
        } else {
          inflated[key] = value
          if (incomingRecord) {
            populatedCopy[key] = incomingRecord
            populatedModified = true
          }
        }
        return {
          ...prev,
          params: flat.flatten(inflated),
          populated: populatedModified ? populatedCopy : prev.populated,
        }
      })
    }
  }, [setRecord])

  const handleSubmit = useCallback((
    customParams: Record<string, string> = {},
  ): Promise<AxiosResponse<RecordActionResponse>> => {
    setLoading(true)
    const formData = recordToFormData(record)
    Object.entries(customParams).forEach(([key, value]) => formData.set(key, value))
    const params = {
      resourceId,
      onUploadProgress: (e): void => setProgress(Math.round((e.loaded * 100) / e.total)),
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    }
    const promise = record.id
      ? api.recordAction({
        ...params,
        actionName: 'edit',
        recordId: record.id,
      })
      : api.resourceAction({
        ...params,
        actionName: 'new',
      }) as Promise<AxiosResponse<RecordActionResponse>>

    promise.then((response) => {
      if (response.data.notice) {
        onNotice(response.data.notice)
      }
      setRecord(prev => mergeRecordResponse(prev, response.data))
      setProgress(0)
      setLoading(false)
    }).catch(() => {
      onNotice({
        message:
        'There was an error updating record, Check out console to see more information.',
        type: 'error',
      })
      setProgress(0)
      setLoading(false)
    })
    return promise
  }, [record, resourceId, setLoading, setProgress])

  return { record, handleChange, submit: handleSubmit, loading, progress }
}

export default useRecord
