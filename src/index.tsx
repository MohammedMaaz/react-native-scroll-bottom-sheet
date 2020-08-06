//@ts-nocheck
import React, { Component, RefObject } from 'react';
import {
  Dimensions,
  FlatList,
  FlatListProps,
  Platform,
  ScrollView,
  ScrollViewProps,
  SectionList,
  SectionListProps,
  StyleSheet,
  View,
  ViewStyle,
  Keyboard,
  TextInput,
  UIManager,
  TouchableOpacity,
  TouchableHighlight,
  TouchableNativeFeedback,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  abs,
  add,
  and,
  call,
  Clock,
  clockRunning,
  cond,
  Easing,
  eq,
  event,
  Extrapolate,
  greaterOrEq,
  greaterThan,
  interpolate,
  multiply,
  not,
  onChange,
  or,
  set,
  startClock,
  stopClock,
  sub,
  timing,
  Value,
} from 'react-native-reanimated';
import {
  NativeViewGestureHandler,
  PanGestureHandler,
  PanGestureHandlerProperties,
  State as GestureState,
  TapGestureHandler,
  TouchableOpacity as RNGHTouchableOpacity,
  TouchableHighlight as RNGHTouchableHighlight,
  TouchableNativeFeedback as RNGHTouchableNativeFeedback,
  TouchableWithoutFeedback as RNGHTouchableWithoutFeedback,
  FlatList as RNGHFlatList,
} from 'react-native-gesture-handler';
import { Assign } from 'utility-types';

const FlatListComponentType = 'FlatList' as const;
const ScrollViewComponentType = 'ScrollView' as const;
const SectionListComponentType = 'SectionList' as const;

const { height: windowHeight } = Dimensions.get('window');
const DRAG_TOSS = 0.05;
const IOS_NORMAL_DECELERATION_RATE = 0.998;
const ANDROID_NORMAL_DECELERATION_RATE = 0.985;
const DEFAULT_ANIMATION_DURATION = 250;
const DEFAULT_EASING = Easing.inOut(Easing.linear);
const imperativeScrollOptions = {
  [FlatListComponentType]: {
    method: 'scrollToIndex',
    args: {
      index: 0,
      viewPosition: 0,
      viewOffset: 1000,
      animated: true,
    },
  },
  [ScrollViewComponentType]: {
    method: 'scrollTo',
    args: {
      x: 0,
      y: 0,
      animated: true,
    },
  },
  [SectionListComponentType]: {
    method: 'scrollToLocation',
    args: {
      itemIndex: 0,
      sectionIndex: 0,
      viewPosition: 0,
      viewOffset: 1000,
      animated: true,
    },
  },
};

type AnimatedScrollableComponent = FlatList | ScrollView | SectionList;

type FlatListOption<T> = Assign<
  { componentType: typeof FlatListComponentType },
  FlatListProps<T>
>;
type ScrollViewOption = Assign<
  { componentType: typeof ScrollViewComponentType },
  ScrollViewProps
>;
type SectionListOption<T> = Assign<
  { componentType: typeof SectionListComponentType },
  SectionListProps<T>
>;

interface TimingParams {
  clock: Animated.Clock;
  from: Animated.Node<number>;
  to: Animated.Node<number>;
  position: Animated.Value<number>;
  finished: Animated.Value<number>;
  frameTime: Animated.Value<number>;
}

type CommonProps = {
  /**
   * Array of numbers that indicate the different resting positions of the bottom sheet (in dp or %), starting from the top.
   * If a percentage is used, that would translate to the relative amount of the total window height.
   * For instance, if 50% is used, that'd be windowHeight * 0.5. If you wanna take into account safe areas during
   * the calculation, such as status bars and notches, please use 'topInset' prop
   */
  snapPoints: Array<string | number>;
  /**
   * Index that references the initial resting position of the drawer, starting from the top
   */
  initialSnapIndex: number;
  /**
   * should bottomsheet adjust itself on keyboard show/hide
   */
  keyboardAwared: boolean;
  /**
   * offset between the keyboard top and the input field after keyboard adjustment
   */
  keyboardTopOffset: number;
   /**
   * should bottomsheet adjust itself on keyboard show/hide
   */
  onKeyboardShow: (ref: ScrollBottomSheet) => void;
   /**
   * should bottomsheet adjust itself on keyboard show/hide
   */
  onKeyboardHide: (ref: ScrollBottomSheet) => void;
  /**
   * Render prop for the handle
   */
  renderHandle: () => React.ReactNode;
  /**
   * Render prop for the footer
   */
  renderFooter: () => React.ReactNode;
  /**
   * Callback that is executed right after the drawer settles on one of the snapping points.
   * The new index is provided on the callback
   * @param index
   */
  onSettle?: (index: number) => void;
  /**
   * Animated value that tracks the position of the drawer, being:
   * 0 => closed
   * 1 => fully opened
   */
  animatedPosition?: Animated.Value<number>;
  /**
   * Configuration for the timing reanimated function
   */
  animationConfig?: {
    duration?: number;
    easing?: Animated.EasingFunction;
  };
  /**
   * This value is useful if you want to take into consideration safe area insets
   * when applying percentages for snapping points. We recommend using react-native-safe-area-context
   * library for that.
   * @see https://github.com/th3rdwave/react-native-safe-area-context#usage, insets.top
   */
  topInset: number;
  /**
   * Reference to FlatList, ScrollView or SectionList in order to execute its imperative methods.
   */
  innerRef: RefObject<FlatList | ScrollView | SectionList>;
  /*
   * Style to be applied to the container.
   */
  containerStyle?: Animated.AnimateStyle<ViewStyle>;
};

type Props<T> = CommonProps &
  (FlatListOption<T> | ScrollViewOption | SectionListOption<T>);

export class ScrollBottomSheet<T extends any> extends Component<Props<T>> {
  static defaultProps = {
    topInset: 0,
    innerRef: React.createRef<AnimatedScrollableComponent>(),
    keyboardAwared: true,
    keyboardTopOffset: 16,
    renderFooter: () => null,
    onKeyboardShow: ()=>null,
    onKeyboardHide: ()=>null,
  };
  /**
   * Gesture Handler references
   */
  private masterDrawer = React.createRef<TapGestureHandler>();
  private drawerHandleRef = React.createRef<PanGestureHandler>();
  private drawerContentRef = React.createRef<PanGestureHandler>();
  private scrollComponentRef = React.createRef<NativeViewGestureHandler>();

  /**
   * ScrollView prop
   */
  private onScrollBeginDrag: ScrollViewProps['onScrollBeginDrag'];
  /**
   * Pan gesture handler events for drawer handle and content
   */
  private onHandleGestureEvent: PanGestureHandlerProperties['onGestureEvent'];
  private onDrawerGestureEvent: PanGestureHandlerProperties['onGestureEvent'];
  /**
   * Main Animated Value that drives the top position of the UI drawer at any point in time
   */
  private translateY: Animated.Node<number>;
  /**
   * Animated value that keeps track of the position: 0 => closed, 1 => opened
   */
  private position: Animated.Node<number>;
  /**
   * Flag to indicate imperative snapping
   */
  private isManuallySetValue: Animated.Value<number> = new Value(0);
  /**
   * Manual snapping amount
   */
  private manualYOffset: Animated.Value<number> = new Value(0);
  /**
   * Flag to indicate offset locking
   */
  private isLockYOffset: Animated.Value<number> = new Value(0);
  /**
   * lockYOffset value
   */
  private lockYOffset: Animated.Value<number> = new Value(0);
  /**
   * Keeps track of the current index
   */
  private nextSnapIndex: Animated.Value<number>;
  /**
   * Deceleration rate of the scroll component. This is used only on Android to
   * compensate the unexpected glide it gets sometimes.
   */
  private decelerationRate: Animated.Value<number>;
  private prevSnapIndex = this.props.initialSnapIndex;
  private dragY = new Value(0);
  private prevDragY = new Value(0);
  private tempDestSnapPoint = new Value(0);
  private isAndroid = new Value(Number(Platform.OS === 'android'));
  private animationClock = new Clock();
  private animationPosition = new Value(0);
  private animationFinished = new Value(0);
  private animationFrameTime = new Value(0);
  private velocityY = new Value(0);
  private lastStartScrollY: Animated.Value<number> = new Value(0);
  private prevTranslateYOffset: Animated.Value<number>;
  private translationY: Animated.Value<number>;
  private destSnapPoint = new Value(0);
  private kb_show = null;
  private kb_hide = null;
  private footerHeightAnim: Animated.Value<number> = new Value(0); //footer height of stick footer
  private footerHeight = 0;

  private lastSnap: Animated.Value<number>;
  private dragWithHandle = new Value(0);
  private scrollUpAndPullDown = new Value(0);
  private didGestureFinish: Animated.Node<0 | 1>;
  private didScrollUpAndPullDown: Animated.Node<number>;
  private setTranslationY: Animated.Node<number>;
  private extraOffset: Animated.Node<number>;
  private calculateNextSnapPoint: (
    i?: number
  ) => number | Animated.Node<number>;

  private scrollComponent: React.ComponentType<
    FlatListProps<T> | ScrollViewProps | SectionListProps<T>
  >;

  convertPercentageToDp = (str: string) =>
    (Number(str.split('%')[0]) * (windowHeight - this.props.topInset)) / 100;

  constructor(props: Props<T>) {
    super(props);
    const { initialSnapIndex, animationConfig } = props;
    const animationDuration =
      animationConfig?.duration || DEFAULT_ANIMATION_DURATION;

    const ScrollComponent = this.getScrollComponent();
    // @ts-ignore
    this.scrollComponent = Animated.createAnimatedComponent(ScrollComponent);

    const snapPoints = this.getNormalisedSnapPoints();
    const openPosition = snapPoints[0];
    const closedPosition = snapPoints[snapPoints.length - 1];
    const initialSnap = snapPoints[initialSnapIndex];
    this.nextSnapIndex = new Value(initialSnapIndex);

    const initialDecelerationRate = Platform.select({
      android:
        props.initialSnapIndex === 0 ? ANDROID_NORMAL_DECELERATION_RATE : 0,
      ios: IOS_NORMAL_DECELERATION_RATE,
    });
    this.decelerationRate = new Value(initialDecelerationRate);

    const handleGestureState = new Value<GestureState>(-1);
    const handleOldGestureState = new Value<GestureState>(-1);
    const drawerGestureState = new Value<GestureState>(-1);
    const drawerOldGestureState = new Value<GestureState>(-1);

    const lastSnapInRange = new Value(1);
    this.prevTranslateYOffset = new Value(initialSnap);
    this.translationY = new Value(initialSnap);

    this.lastSnap = new Value(initialSnap);

    this.onHandleGestureEvent = event([
      {
        nativeEvent: {
          translationY: this.dragY,
          oldState: handleOldGestureState,
          state: handleGestureState,
          velocityY: this.velocityY,
        },
      },
    ]);
    this.onDrawerGestureEvent = event([
      {
        nativeEvent: {
          translationY: this.dragY,
          oldState: drawerOldGestureState,
          state: drawerGestureState,
          velocityY: this.velocityY,
        },
      },
    ]);
    this.onScrollBeginDrag = event([
      {
        nativeEvent: {
          contentOffset: { y: this.lastStartScrollY },
        },
      },
    ]);

    const didHandleGestureBegin = eq(handleGestureState, GestureState.ACTIVE);

    const isAnimationInterrupted = and(
      or(
        eq(handleGestureState, GestureState.BEGAN),
        eq(drawerGestureState, GestureState.BEGAN)
      ),
      clockRunning(this.animationClock)
    );

    this.didGestureFinish = or(
      and(
        eq(handleOldGestureState, GestureState.ACTIVE),
        eq(handleGestureState, GestureState.END)
      ),
      and(
        eq(drawerOldGestureState, GestureState.ACTIVE),
        eq(drawerGestureState, GestureState.END)
      )
    );

    // Function that determines if the last snap point is in the range {snapPoints}
    // In the case of interruptions in the middle of an animation, we'll get
    // lastSnap values outside the range
    const isLastSnapPointInRange = (i: number = 0): Animated.Node<number> =>
      i === snapPoints.length
        ? lastSnapInRange
        : cond(
            eq(this.lastSnap, snapPoints[i]),
            [set(lastSnapInRange, 1)],
            isLastSnapPointInRange(i + 1)
          );

    const scrollY = [
      set(lastSnapInRange, 0),
      isLastSnapPointInRange(),
      cond(
        or(
          didHandleGestureBegin,
          and(
            this.isManuallySetValue,
            not(eq(this.manualYOffset, snapPoints[0]))
          )
        ),
        [set(this.dragWithHandle, 1), 0]
      ),
      cond(
        // This is to account for a continuous scroll on the drawer from a snap point
        // Different than top, bringing the drawer to the top position, so that if we
        // change scroll direction without releasing the gesture, it doesn't pull down the drawer again
        and(
          eq(this.dragWithHandle, 1),
          greaterThan(snapPoints[0], add(this.lastSnap, this.dragY)),
          and(not(eq(this.lastSnap, snapPoints[0])), lastSnapInRange)
        ),
        [
          set(this.lastSnap, snapPoints[0]),
          set(this.dragWithHandle, 0),
          this.lastStartScrollY,
        ],
        cond(eq(this.dragWithHandle, 1), 0, this.lastStartScrollY)
      ),
    ];

    this.didScrollUpAndPullDown = cond(
      and(
        greaterOrEq(this.dragY, this.lastStartScrollY),
        greaterThan(this.lastStartScrollY, 0)
      ),
      set(this.scrollUpAndPullDown, 1)
    );

    this.setTranslationY = cond(
      and(
        not(this.dragWithHandle),
        not(greaterOrEq(this.dragY, this.lastStartScrollY))
      ),
      set(this.translationY, sub(this.dragY, this.lastStartScrollY)),
      set(this.translationY, this.dragY)
    );

    this.extraOffset = cond(
      eq(this.scrollUpAndPullDown, 1),
      this.lastStartScrollY,
      0
    );
    const endOffsetY = add(
      this.lastSnap,
      this.translationY,
      multiply(DRAG_TOSS, this.velocityY)
    );

    this.calculateNextSnapPoint = (i = 0): Animated.Node<number> | number =>
      i === snapPoints.length
        ? this.tempDestSnapPoint
        : cond(
            greaterThan(
              abs(sub(this.tempDestSnapPoint, endOffsetY)),
              abs(sub(add(snapPoints[i], this.extraOffset), endOffsetY))
            ),
            [
              set(this.tempDestSnapPoint, add(snapPoints[i], this.extraOffset)),
              set(this.nextSnapIndex, i),
              this.calculateNextSnapPoint(i + 1),
            ],
            this.calculateNextSnapPoint(i + 1)
          );

    const runTiming = ({
      clock,
      from,
      to,
      position,
      finished,
      frameTime,
    }: TimingParams) => {
      const state = {
        finished,
        position,
        time: new Value(0),
        frameTime,
      };

      const animationParams = {
        duration: animationDuration,
        easing: animationConfig?.easing || DEFAULT_EASING,
      };

      const config = {
        toValue: new Value(0),
        ...animationParams,
      };

      return [
        cond(and(not(clockRunning(clock)), not(eq(finished, 1))), [
          // If the clock isn't running, we reset all the animation params and start the clock
          set(state.finished, 0),
          set(state.time, 0),
          set(state.position, from),
          set(state.frameTime, 0),
          set(config.toValue, to),
          startClock(clock),
        ]),
        // We run the step here that is going to update position
        timing(clock, state, config),
        cond(
          state.finished,
          [
            call([this.nextSnapIndex], ([value]) => {
              if (value !== this.prevSnapIndex) {
                this.props.onSettle?.(value);
              }
              this.prevSnapIndex = value;
            }),
            // Resetting appropriate values
            set(drawerOldGestureState, GestureState.END),
            set(handleOldGestureState, GestureState.END),
            set(this.prevTranslateYOffset, state.position),
            cond(eq(this.scrollUpAndPullDown, 1), [
              set(
                this.prevTranslateYOffset,
                sub(this.prevTranslateYOffset, this.lastStartScrollY)
              ),
              set(this.lastStartScrollY, 0),
              set(this.scrollUpAndPullDown, 0),
            ]),
            cond(eq(this.destSnapPoint, snapPoints[0]), [
              set(this.dragWithHandle, 0),
            ]),
            set(this.isManuallySetValue, 0),
            set(this.manualYOffset, 0),
            stopClock(clock),
            this.prevTranslateYOffset,
          ],
          // We made the block return the updated position,
          state.position
        ),
      ];
    };

    const translateYOffset = cond(
      isAnimationInterrupted,
      [
        // set(prevTranslateYOffset, animationPosition) should only run if we are
        // interrupting an animation when the drawer is currently in a different
        // position than the top
        cond(
          or(
            this.dragWithHandle,
            greaterOrEq(abs(this.prevDragY), this.lastStartScrollY)
          ),
          set(this.prevTranslateYOffset, this.animationPosition)
        ),
        set(this.animationFinished, 1),
        set(this.translationY, 0),
        // Resetting appropriate values
        set(drawerOldGestureState, GestureState.END),
        set(handleOldGestureState, GestureState.END),
        // By forcing that frameTime exceeds duration, it has the effect of stopping the animation
        set(this.animationFrameTime, add(animationDuration, 1000)),
        stopClock(this.animationClock),
        this.prevTranslateYOffset,
      ],
      cond(
        or(
          this.didGestureFinish,
          this.isManuallySetValue,
          clockRunning(this.animationClock)
        ),
        [
          runTiming({
            clock: this.animationClock,
            from: cond(
              this.isManuallySetValue,
              this.prevTranslateYOffset,
              add(this.prevTranslateYOffset, this.translationY)
            ),
            to: this.destSnapPoint,
            position: this.animationPosition,
            finished: this.animationFinished,
            frameTime: this.animationFrameTime,
          }),
        ],
        [
          set(this.animationFrameTime, 0),
          set(this.animationFinished, 0),
          // @ts-ignore
          this.prevTranslateYOffset,
        ]
      )
    );

    this.translateY = cond(
      this.isLockYOffset,
      this.lockYOffset,
      interpolate(add(translateYOffset, this.dragY, multiply(scrollY, -1)), {
        inputRange: [openPosition, closedPosition],
        outputRange: [openPosition, closedPosition],
        extrapolate: Extrapolate.CLAMP,
      })
    );

    this.position = interpolate(this.translateY, {
      inputRange: [openPosition, closedPosition],
      outputRange: [1, 0],
      extrapolate: Extrapolate.CLAMP,
    });
  }

  private getNormalisedSnapPoints = () => {
    return this.props.snapPoints.map(p => {
      if (typeof p === 'string') {
        return this.convertPercentageToDp(p);
      } else if (typeof p === 'number') {
        return p;
      }

      throw new Error(
        `Invalid type for value ${p}: ${typeof p}. It should be either a percentage string or a number`
      );
    });
  };

  private getScrollComponent = () => {
    switch (this.props.componentType) {
      case 'FlatList':
        return FlatList;
      case 'ScrollView':
        return ScrollView;
      case 'SectionList':
        return SectionList;
      default:
        throw new Error(
          'Component type not supported: it should be one of `FlatList`, `ScrollView` or `SectionList`'
        );
    }
  };

  snapTo = (index: number) => {
    const snapPoints = this.getNormalisedSnapPoints();
    this.isManuallySetValue.setValue(1);
    this.manualYOffset.setValue(snapPoints[index]);
    this.nextSnapIndex.setValue(index);
  };

  lockToOffset = (offset) => {
    this.isLockYOffset.setValue(1);
    this.lockYOffset.setValue(offset);
    this.prevTranslateYOffset.setValue(offset);
  }

  releaseLock = ()=> {
    this.isLockYOffset.setValue(0);
  }

  componentDidMount() {
      this.kb_show = Keyboard.addListener('keyboardDidShow', event => {
        if (this.props.keyboardAwared) {
          const offset =
            this.props.keyboardTopOffset + Platform.select({ ios: 0, android: this.footerHeight });
          const keyboardHeight = event.endCoordinates.height;
          const currentlyFocusedField = TextInput.State.currentlyFocusedField();
          UIManager.measure(
            currentlyFocusedField,
            (originX, originY, width, height, pageX, pageY) => {
              const gap =
                windowHeight - (pageY + height + offset) - keyboardHeight;
              const snapPoints = this.getNormalisedSnapPoints();
              if (gap < 0)  this.lockToOffset(snapPoints[this.prevSnapIndex] + gap);
            }
          );
        }
        this.props.onKeyboardShow(this, event);
      });

      this.kb_hide = Keyboard.addListener('keyboardDidHide', (event) => {
        if (this.props.keyboardAwared) {
          this.releaseLock();
          this.snapTo(this.prevSnapIndex);
        }
        this.props.onKeyboardHide(this, event);
      });
  }

  componentWillUnmount() {
    this.kb_show?.remove();
    this.kb_hide?.remove();
  }

  render() {
    const {
      renderHandle,
      snapPoints,
      initialSnapIndex,
      componentType,
      onSettle,
      animatedPosition,
      containerStyle,
      ...rest
    } = this.props;
    const AnimatedScrollableComponent = this.scrollComponent;
    const normalisedSnapPoints = this.getNormalisedSnapPoints();
    const initialSnap = normalisedSnapPoints[initialSnapIndex];

    const Content = (
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          containerStyle,
          // @ts-ignore
          {
            transform: [{ translateY: this.translateY }],
            paddingBottom: this.footerHeightAnim,
          },
        ]}
      >
        <PanGestureHandler
          ref={this.drawerHandleRef}
          shouldCancelWhenOutside={false}
          simultaneousHandlers={this.masterDrawer}
          onGestureEvent={this.onHandleGestureEvent}
          onHandlerStateChange={this.onHandleGestureEvent}
        >
          <Animated.View>{renderHandle()}</Animated.View>
        </PanGestureHandler>
        <PanGestureHandler
          ref={this.drawerContentRef}
          simultaneousHandlers={[this.scrollComponentRef, this.masterDrawer]}
          shouldCancelWhenOutside={false}
          onGestureEvent={this.onDrawerGestureEvent}
          onHandlerStateChange={this.onDrawerGestureEvent}
        >
          <Animated.View style={styles.container}>
            <NativeViewGestureHandler
              ref={this.scrollComponentRef}
              waitFor={this.masterDrawer}
              simultaneousHandlers={this.drawerContentRef}
            >
              <AnimatedScrollableComponent
                overScrollMode="never"
                bounces={false}
                {...rest}
                ref={this.props.innerRef}
                // @ts-ignore
                decelerationRate={this.decelerationRate}
                onScrollBeginDrag={this.onScrollBeginDrag}
                scrollEventThrottle={1}
                contentContainerStyle={[
                  rest.contentContainerStyle,
                  { paddingBottom: this.getNormalisedSnapPoints()[0] },
                ]}
              />
            </NativeViewGestureHandler>
          </Animated.View>
        </PanGestureHandler>
        {this.props.animatedPosition && (
          <Animated.Code
            exec={onChange(
              this.position,
              set(this.props.animatedPosition, this.position)
            )}
          />
        )}
        <Animated.Code
          exec={onChange(
            this.dragY,
            cond(not(eq(this.dragY, 0)), set(this.prevDragY, this.dragY))
          )}
        />
        <Animated.Code
          exec={onChange(
            this.didGestureFinish,
            cond(this.didGestureFinish, [
              this.didScrollUpAndPullDown,
              this.setTranslationY,
              set(
                this.tempDestSnapPoint,
                add(normalisedSnapPoints[0], this.extraOffset)
              ),
              set(this.nextSnapIndex, 0),
              set(this.destSnapPoint, this.calculateNextSnapPoint()),
              cond(
                and(
                  greaterThan(this.dragY, this.lastStartScrollY),
                  this.isAndroid,
                  not(this.dragWithHandle)
                ),
                call([], () => {
                  // This prevents the scroll glide from happening on Android when pulling down with inertia.
                  // It's not perfect, but does the job for now
                  const { method, args } = imperativeScrollOptions[
                    this.props.componentType
                  ];

                  if (
                    (this.props.componentType === 'FlatList' &&
                      (this.props?.data?.length || 0) > 0) ||
                    (this.props.componentType === 'SectionList' &&
                      this.props.sections.length > 0) ||
                    this.props.componentType === 'ScrollView'
                  ) {
                    // @ts-ignore
                    this.props.innerRef.current?.getNode()[method](args);
                  }
                })
              ),
              set(this.dragY, 0),
              set(this.velocityY, 0),
              set(
                this.lastSnap,
                sub(
                  this.destSnapPoint,
                  cond(
                    eq(this.scrollUpAndPullDown, 1),
                    this.lastStartScrollY,
                    0
                  )
                )
              ),
              call([this.lastSnap], ([value]) => {
                // This is the TapGHandler trick
                // @ts-ignore
                this.masterDrawer?.current?.setNativeProps({
                  maxDeltaY: value - this.getNormalisedSnapPoints()[0],
                });
              }),
              set(
                this.decelerationRate,
                cond(
                  eq(this.isAndroid, 1),
                  cond(
                    eq(this.lastSnap, normalisedSnapPoints[0]),
                    ANDROID_NORMAL_DECELERATION_RATE,
                    0
                  ),
                  IOS_NORMAL_DECELERATION_RATE
                )
              ),
            ])
          )}
        />
        <Animated.Code
          exec={onChange(this.isManuallySetValue, [
            cond(
              this.isManuallySetValue,
              [
                set(this.destSnapPoint, this.manualYOffset),
                set(this.animationFinished, 0),
                set(this.lastSnap, this.manualYOffset),
                call([this.lastSnap], ([value]) => {
                  // This is the TapGHandler trick
                  // @ts-ignore
                  this.masterDrawer?.current?.setNativeProps({
                    maxDeltaY: value - this.getNormalisedSnapPoints()[0],
                  });
                }),
              ],
              [set(this.nextSnapIndex, 0)]
            ),
          ])}
        />
      </Animated.View>
    );

    let WrappedContent;
    // On Android, having an intermediary view with pointerEvents="box-none", breaks the
    // waitFor logic
    if (Platform.OS === 'android')
      WrappedContent = (
        <TapGestureHandler
          maxDurationMs={100000}
          ref={this.masterDrawer}
          maxDeltaY={initialSnap - this.getNormalisedSnapPoints()[0]}
          shouldCancelWhenOutside={false}
        >
          {Content}
        </TapGestureHandler>
      );
    // On iOS, We need to wrap the content on a view with PointerEvents box-none
    // So that we can start scrolling automatically when reaching the top without
    // Stopping the gesture
    else
      WrappedContent = (
        <TapGestureHandler
          maxDurationMs={100000}
          ref={this.masterDrawer}
          maxDeltaY={initialSnap - this.getNormalisedSnapPoints()[0]}
        >
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            {Content}
          </View>
        </TapGestureHandler>
      );

    return (
      <>
        {WrappedContent}
        <View
          onLayout={e => {
            this.footerHeight = e.nativeEvent.layout.height
            this.footerHeightAnim.setValue(e.nativeEvent.layout.height)
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <View style={{ flex: 1 }}>{this.props.renderFooter()}</View>
        </View>
      </>
    );
  }
}

export default ScrollBottomSheet;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export const BSTouchableOpacity = props => {
  if (Platform.OS === 'android') {
    return <RNGHTouchableOpacity {...props} />;
  }

  return <TouchableOpacity {...props} />;
};

export const BSTouchableHightlight = props => {
  if (Platform.OS === 'android') {
    return <RNGHTouchableHighlight {...props} />;
  }

  return <TouchableHighlight {...props} />;
};

export const BSTouchableNativeFeedback = props => {
  if (Platform.OS === 'android') {
    return <RNGHTouchableNativeFeedback {...props} />;
  }

  return <TouchableNativeFeedback {...props} />;
};

export const BSTouchableWithoutFeedback = props => {
  if (Platform.OS === 'android') {
    return <RNGHTouchableWithoutFeedback {...props} />;
  }

  return <TouchableWithoutFeedback {...props} />;
};

export const BSFlatList = RNGHFlatList;
