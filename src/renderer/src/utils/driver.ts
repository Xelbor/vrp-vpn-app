import type { NavigateFunction } from 'react-router-dom'
import { t } from 'i18next'

type PopoverButton = 'next' | 'previous' | 'close'

type PopoverConfig = {
  title?: string
  description?: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  showButtons?: PopoverButton[]
  onNextClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
  onCloseClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
}

type DriveStep = {
  element?: string | Element | (() => Element | null)
  popover?: PopoverConfig
  onHighlighted?: (
    element: Element | undefined,
    step: DriveStep,
    options: DriverStepOptions
  ) => void
  onDeselected?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
}

type PopoverDOM = {
  wrapper: HTMLElement
  arrow: HTMLElement
  title: HTMLElement
  description: HTMLElement
  footer: HTMLElement
  footerButtons: HTMLElement
  previousButton: HTMLElement
  nextButton: HTMLElement
  closeButton: HTMLElement
  progress: HTMLElement
}

type DriverConfig = {
  showProgress?: boolean
  showButtons?: PopoverButton[]
  allowClose?: boolean
  nextBtnText?: string
  prevBtnText?: string
  doneBtnText?: string
  progressText?: string
  overlayOpacity?: number
  steps: DriveStep[]
  onHighlightStarted?: (
    element: Element | undefined,
    step: DriveStep,
    options: DriverStepOptions
  ) => void
  onDestroyed?: () => void
  onCloseClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
  onPopoverRender?: (popover: PopoverDOM, options: { config: DriverConfig; state: unknown; driver: Driver }) => void
}

type Driver = {
  drive: (stepIndex?: number) => void
  destroy: () => void
  moveNext: () => void
  movePrevious: () => void
  getActiveIndex: () => number | undefined
}

type DriverFactory = (config: DriverConfig) => Driver

type DriverStepOptions = {
  driver: Driver
}

type StartTourOptions = {
  onMainGuideCompleted?: () => void
}

type OptionalInfoStepOptions = {
  element: string | (() => Element | null)
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  isAvailable?: (element: Element) => boolean
}

type AutoAdvanceStepOptions = {
  element: string | (() => Element | null)
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  isCompleted: () => boolean
  nextDelayMs?: number
}

type GuideMode = 'default' | 'deep-link' | 'admin-required'

let driverInstance: Driver | null = null
let cssLoaded = false
let guideMode: GuideMode = 'default'
let stopGuideModeObserver: (() => void) | null = null
let isSwitchingGuideMode = false
let onMainGuideCompleted: (() => void) | null = null
let isMainGuideCompleted = false
let F11Count = 0
let f11ResetTimeout: number | null = null
let removeTourExitHotkeyListener: (() => void) | null = null
let isStartingTour = false
let guideNavigationDirection: 'forward' | 'backward' = 'forward'
let previousGuideStepIndex: number | undefined

const GUIDE_SELECTORS = {
  homeReady: '[data-guide="home-profile-state-ready"]',
  addProfileButton: '[data-guide="home-add-profile-btn"]',
  profileImportUrlInput: '[data-guide="profile-import-url-input"]',
  profileImportPasteButton: '[data-guide="profile-import-paste-btn"]',
  profileImportButton: '[data-guide="profile-import-submit"]',
  profileInstallConfirmModal: '.guide-profile-install-modal',
  adminRequiredModal: '.guide-admin-required-modal',
  profileHeader: '[data-guide="home-profile-header"]',
  profileAnnounce: '[data-guide="home-profile-announce"]',
  powerButton: '[data-guide="home-power-toggle"]',
  groupSelector: '[data-guide="home-group-selector"]',
  supportButton: '[data-guide="home-support-link"]',
  sidebar: '[data-guide="app-sidebar"]'
} as const

const WAIT_TIMEOUT_MS = 15_000
const WAIT_INTERVAL_MS = 120

function clearGuideModeObserver(): void {
  stopGuideModeObserver?.()
  stopGuideModeObserver = null
}

function clearTourExitHotkeyListener(): void {
  F11Count = 0
  if (f11ResetTimeout !== null) {
    window.clearTimeout(f11ResetTimeout)
    f11ResetTimeout = null
  }
  removeTourExitHotkeyListener?.()
  removeTourExitHotkeyListener = null
}

function ensureTourExitHotkeyListener(): void {
  if (removeTourExitHotkeyListener) return

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F11') return

    event.preventDefault()

    if (f11ResetTimeout !== null) window.clearTimeout(f11ResetTimeout)
    F11Count++
    f11ResetTimeout = window.setTimeout(() => {
      F11Count = 0
      f11ResetTimeout = null
    }, 3000)

    if (F11Count < 5) return

    F11Count = 0
    driverInstance?.destroy()
  }

  window.addEventListener('keydown', handleKeyDown)
  removeTourExitHotkeyListener = (): void => {
    window.removeEventListener('keydown', handleKeyDown)
  }
}

function markMainGuideCompleted(): void {
  if (isMainGuideCompleted) return

  isMainGuideCompleted = true
  onMainGuideCompleted?.()
}

async function loadDriverModule(): Promise<{ driver: DriverFactory }> {
  if (!cssLoaded) {
    await import('driver.js/dist/driver.css')
    cssLoaded = true
  }
  return import('driver.js') as Promise<{ driver: DriverFactory }>
}

function resolveElement(selector: string): Element | null {
  return document.querySelector(selector)
}

function waitForAnyElement(
  selectors: readonly string[],
  timeoutMs = WAIT_TIMEOUT_MS
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const check = (): void => {
      const element = selectors.map(resolveElement).find(Boolean)
      if (element) {
        resolve(element)
        return
      }

      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Guide timeout waiting for ${selectors.join(', ')}`))
        return
      }

      setTimeout(check, WAIT_INTERVAL_MS)
    }

    check()
  })
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function createOptionalInfoStep({
  element,
  title,
  description,
  side = 'bottom',
  align = 'center',
  isAvailable = () => true
}: OptionalInfoStepOptions): DriveStep {
  let pendingSkipTimeout: number | null = null

  const resolveTarget = (): Element | null => {
    const target = typeof element === 'string' ? resolveElement(element) : element()
    return target && isAvailable(target) ? target : null
  }

  const clearPendingSkip = (): void => {
    if (pendingSkipTimeout === null) return
    window.clearTimeout(pendingSkipTimeout)
    pendingSkipTimeout = null
  }

  return {
    element: resolveTarget,
    popover: {
      title,
      description,
      side,
      align
    },
    onHighlighted: (highlightedElement, _step, options): void => {
      clearPendingSkip()
      if (highlightedElement) return

      pendingSkipTimeout = window.setTimeout(() => {
        pendingSkipTimeout = null
        if (guideNavigationDirection === 'backward') {
          options.driver.movePrevious()
        } else {
          options.driver.moveNext()
        }
      }, 0)
    },
    onDeselected: clearPendingSkip
  }
}

function startAutoAdvanceWatcher(isCompleted: () => boolean, onCompleted: () => void): () => void {
  let isStopped = false

  const runCheck = (): void => {
    if (isStopped || !isCompleted()) return

    try {
      onCompleted()
    } finally {
      stop()
    }
  }

  const scheduleCheck = (): void => {
    window.setTimeout(runCheck, 0)
  }

  const triggerEvents: (keyof DocumentEventMap)[] = [
    'click',
    'input',
    'change',
    'keyup',
    'paste',
    'submit'
  ]

  const stop = (): void => {
    if (isStopped) return

    isStopped = true
    window.clearInterval(intervalId)
    triggerEvents.forEach((eventName) => {
      document.removeEventListener(eventName, scheduleCheck, true)
    })
  }

  triggerEvents.forEach((eventName) => {
    document.addEventListener(eventName, scheduleCheck, true)
  })

  const intervalId = window.setInterval(runCheck, WAIT_INTERVAL_MS)

  runCheck()

  return stop
}

function createAutoAdvanceStep({
  element,
  title,
  description,
  side = 'bottom',
  align = 'center',
  isCompleted,
  nextDelayMs = 0
}: AutoAdvanceStepOptions): DriveStep {
  let stopWatcher: (() => void) | null = null
  let pendingMoveNextTimeout: number | null = null

  const clearPendingMoveNext = (): void => {
    if (pendingMoveNextTimeout === null) return
    window.clearTimeout(pendingMoveNextTimeout)
    pendingMoveNextTimeout = null
  }

  return {
    element,
    popover: {
      title,
      description,
      side,
      align,
      showButtons: ['previous']
    },
    onHighlighted: (_highlightedElement, _step, options): void => {
      stopWatcher?.()
      clearPendingMoveNext()
      stopWatcher = startAutoAdvanceWatcher(isCompleted, () => {
        if (nextDelayMs > 0) {
          pendingMoveNextTimeout = window.setTimeout(() => {
            pendingMoveNextTimeout = null
            options.driver.moveNext()
          }, nextDelayMs)
          return
        }
        options.driver.moveNext()
      })
    },
    onDeselected: (): void => {
      stopWatcher?.()
      stopWatcher = null
      clearPendingMoveNext()
    }
  }
}

function buildGuideSteps(mode: GuideMode = 'default'): DriveStep[] {
  const hasNoProfilesState = Boolean(resolveElement(GUIDE_SELECTORS.addProfileButton))
  const steps: DriveStep[] = []

  if (mode === 'admin-required') {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.adminRequiredModal) ??
          resolveElement(GUIDE_SELECTORS.powerButton) ??
          resolveElement(GUIDE_SELECTORS.addProfileButton),
        title: t('guide.adminRequiredTitle'),
        description: t('guide.adminRequiredDesc'),
        side: 'top',
        isCompleted: () => !resolveElement(GUIDE_SELECTORS.adminRequiredModal)
      })
    )
  }

  if (mode === 'default') {
    steps.push({
      popover: {
        title: t('guide.welcome'),
        description: t('guide.welcomeDesc'),
        side: 'over',
        align: 'center',
        showButtons: ['next']
      }
    })
  }

  if (mode === 'deep-link') {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.deepLinkImportTitle'),
        description: t('guide.deepLinkImportDesc'),
        side: 'top',
        isCompleted: () => Boolean(resolveElement(GUIDE_SELECTORS.profileHeader))
      })
    )
  } else if (hasNoProfilesState) {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.addProfileButton),
        title: t('guide.addProfileTitle'),
        description: t('guide.addProfileDesc'),
        side: 'top',
        isCompleted: () =>
          Boolean(
            resolveElement(GUIDE_SELECTORS.profileImportUrlInput) ??
            resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
            resolveElement(GUIDE_SELECTORS.profileHeader)
          )
      }),
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileImportPasteButton) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.insertLinkTitle'),
        description: t('guide.insertLinkDesc'),
        side: 'left',
        align: 'center',
        isCompleted: () => {
          const profileHeader = resolveElement(GUIDE_SELECTORS.profileHeader)
          const urlInput = resolveElement(
            GUIDE_SELECTORS.profileImportUrlInput
          ) as HTMLInputElement | null

          if (profileHeader && !urlInput) return true
          if (resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) return true

          return Boolean(urlInput && isValidHttpUrl(urlInput.value.trim()))
        }
      }),
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileImportButton) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.importProfileTitle'),
        description: t('guide.importProfileDesc'),
        side: 'top',
        isCompleted: () => Boolean(resolveElement(GUIDE_SELECTORS.profileHeader))
      })
    )
  }

  steps.push(
    createOptionalInfoStep({
      element: GUIDE_SELECTORS.profileHeader,
      title: t('guide.profileHeaderTitle'),
      description: t('guide.profileHeaderDesc'),
      side: 'bottom'
    }),
    createOptionalInfoStep({
      element: GUIDE_SELECTORS.profileAnnounce,
      title: t('guide.profileAnnounceTitle'),
      description: t('guide.profileAnnounceDesc'),
      side: 'bottom'
    }),
    createOptionalInfoStep({
      element: GUIDE_SELECTORS.powerButton,
      title: t('guide.powerButtonTitle'),
      description: t('guide.powerButtonDesc'),
      side: 'top',
      isAvailable: (element) =>
        element instanceof HTMLButtonElement && !element.disabled
    }),
    createOptionalInfoStep({
      element: GUIDE_SELECTORS.groupSelector,
      title: t('guide.groupSelectorTitle'),
      description: t('guide.groupSelectorDesc'),
      side: 'top'
    }),
    createOptionalInfoStep({
      element: () =>
        window.matchMedia('(min-width: 768px)').matches
          ? resolveElement(GUIDE_SELECTORS.sidebar)
          : null,
      title: t('guide.sidebarTitle'),
      description: t('guide.sidebarDesc'),
      side: 'right'
    }),
    createOptionalInfoStep({
      element: GUIDE_SELECTORS.supportButton,
      title: t('guide.supportTitle'),
      description: t('guide.supportDesc'),
      side: 'top',
      align: 'center'
    }),
    {
      popover: {
        title: t('guide.tutorialEnd'),
        description: t('guide.tutorialEndDesc'),
        side: 'over',
        align: 'center',
        onNextClick: (_element, _step, options): void => {
          markMainGuideCompleted()
          options.driver.destroy()
        }
      }
    }
  )

  return steps
}

function resolveGuideMode(mode: GuideMode): GuideMode {
  if (resolveElement(GUIDE_SELECTORS.adminRequiredModal)) return 'admin-required'
  if (mode === 'default' && resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) {
    return 'deep-link'
  }
  return mode
}

async function createDriverWithMode(mode: GuideMode): Promise<Driver> {
  if (driverInstance) {
    driverInstance.destroy()
    driverInstance = null
  }

  const { driver } = await loadDriverModule()
  const resolvedMode = resolveGuideMode(mode)

  guideMode = resolvedMode
  guideNavigationDirection = 'forward'
  previousGuideStepIndex = undefined
  driverInstance = driver({
    allowClose: false,
    showProgress: true,
    showButtons: ['next', 'previous'],
    nextBtnText: t('guide.nextStep'),
    prevBtnText: t('guide.prevStep'),
    doneBtnText: t('guide.done'),
    progressText: '{{current}} / {{total}}',
    overlayOpacity: 0.9,
    steps: buildGuideSteps(resolvedMode),
    onHighlightStarted: (_element, _step, options): void => {
      const activeIndex = options.driver.getActiveIndex()
      if (activeIndex === undefined) return

      if (previousGuideStepIndex !== undefined) {
        guideNavigationDirection =
          activeIndex < previousGuideStepIndex ? 'backward' : 'forward'
      }
      previousGuideStepIndex = activeIndex
    },
    onCloseClick: (_element, _step, options): void => {
      markMainGuideCompleted()
      options.driver.destroy()
    },
    onPopoverRender: (popover): void => {
      const skipButton = document.createElement('button')
      skipButton.innerText = t('guide.skipTour')
      skipButton.className = 'driver-popover-close-btn driver-popover-skip-btn'
      popover.footerButtons.appendChild(skipButton)
    },
    onDestroyed: (): void => {
      clearGuideModeObserver()
      clearTourExitHotkeyListener()
      guideMode = 'default'
      driverInstance = null
    }
  })
  ensureTourExitHotkeyListener()
  startGuideModeObserverLoop(driverInstance)

  return driverInstance
}

async function restartGuideInMode(mode: GuideMode): Promise<void> {
  if (isSwitchingGuideMode || guideMode === mode) return

  isSwitchingGuideMode = true
  try {
    const d = await createDriverWithMode(mode)
    d.drive()
  } finally {
    isSwitchingGuideMode = false
  }
}

function switchGuideModeIfNeeded(driver: Driver): void {
  if (isSwitchingGuideMode) return
  if (driver !== driverInstance) return

  if (resolveElement(GUIDE_SELECTORS.adminRequiredModal)) {
    if (guideMode !== 'admin-required') {
      void restartGuideInMode('admin-required').catch(() => {
        driverInstance?.destroy()
      })
    }
    return
  }

  if (guideMode === 'default' && resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) {
    void restartGuideInMode('deep-link').catch(() => {
      driverInstance?.destroy()
    })
  }
}

function startGuideModeObserverLoop(driver: Driver): void {
  clearGuideModeObserver()

  if (typeof MutationObserver === 'undefined') return
  if (!document.body) return

  const observer = new MutationObserver(() => {
    switchGuideModeIfNeeded(driver)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  switchGuideModeIfNeeded(driver)
  stopGuideModeObserver = (): void => {
    observer.disconnect()
  }
}

export async function createDriver(_navigate: NavigateFunction): Promise<Driver> {
  return createDriverWithMode('default')
}

export async function startTour(
  navigate: NavigateFunction,
  options: StartTourOptions = {}
): Promise<void> {
  if (isStartingTour) return
  isStartingTour = true

  try {
    onMainGuideCompleted = options.onMainGuideCompleted ?? null
    isMainGuideCompleted = false

    navigate('/home')

    try {
      await waitForAnyElement([
        GUIDE_SELECTORS.homeReady,
        GUIDE_SELECTORS.profileInstallConfirmModal,
        GUIDE_SELECTORS.adminRequiredModal
      ])
    } catch {
      return
    }

    const d = await createDriver(navigate)
    d.drive()
  } finally {
    isStartingTour = false
  }
}
