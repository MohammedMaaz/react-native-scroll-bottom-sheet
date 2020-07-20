//@ts-nocheck
import React, { Component } from 'react';
import { Dimensions, FlatList, Platform, ScrollView, SectionList, StyleSheet, View, Keyboard, TextInput, UIManager, TouchableOpacity, TouchableHighlight, TouchableNativeFeedback, TouchableWithoutFeedback, } from 'react-native';
import Animated, { abs, add, and, call, Clock, clockRunning, cond, Easing, eq, event, Extrapolate, greaterOrEq, greaterThan, interpolate, multiply, not, onChange, or, set, startClock, stopClock, sub, timing, Value, } from 'react-native-reanimated';
import { NativeViewGestureHandler, PanGestureHandler, State as GestureState, TapGestureHandler, TouchableOpacity as RNGHTouchableOpacity, TouchableHighlight as RNGHTouchableHighlight, TouchableNativeFeedback as RNGHTouchableNativeFeedback, TouchableWithoutFeedback as RNGHTouchableWithoutFeedback, FlatList as RNGHFlatList, } from 'react-native-gesture-handler';
const FlatListComponentType = 'FlatList';
const ScrollViewComponentType = 'ScrollView';
const SectionListComponentType = 'SectionList';
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
export class ScrollBottomSheet extends Component {
    constructor(props) {
        super(props);
        /**
         * Gesture Handler references
         */
        this.masterDrawer = React.createRef();
        this.drawerHandleRef = React.createRef();
        this.drawerContentRef = React.createRef();
        this.scrollComponentRef = React.createRef();
        /**
         * Flag to indicate imperative snapping
         */
        this.isManuallySetValue = new Value(0);
        /**
         * Manual snapping amount
         */
        this.manualYOffset = new Value(0);
        /**
         * Flag to indicate offset locking
         */
        this.isLockYOffset = new Value(0);
        /**
         * lockYOffset value
         */
        this.lockYOffset = new Value(0);
        this.prevSnapIndex = this.props.initialSnapIndex;
        this.dragY = new Value(0);
        this.prevDragY = new Value(0);
        this.tempDestSnapPoint = new Value(0);
        this.isAndroid = new Value(Number(Platform.OS === 'android'));
        this.animationClock = new Clock();
        this.animationPosition = new Value(0);
        this.animationFinished = new Value(0);
        this.animationFrameTime = new Value(0);
        this.velocityY = new Value(0);
        this.lastStartScrollY = new Value(0);
        this.destSnapPoint = new Value(0);
        this.kb_show = null;
        this.kb_hide = null;
        this.footerHeightAnim = new Value(0); //footer height of stick footer
        this.footerHeight = 0;
        this.dragWithHandle = new Value(0);
        this.scrollUpAndPullDown = new Value(0);
        this.convertPercentageToDp = (str) => (Number(str.split('%')[0]) * (windowHeight - this.props.topInset)) / 100;
        this.getNormalisedSnapPoints = () => {
            return this.props.snapPoints.map(p => {
                if (typeof p === 'string') {
                    return this.convertPercentageToDp(p);
                }
                else if (typeof p === 'number') {
                    return p;
                }
                throw new Error(`Invalid type for value ${p}: ${typeof p}. It should be either a percentage string or a number`);
            });
        };
        this.getScrollComponent = () => {
            switch (this.props.componentType) {
                case 'FlatList':
                    return FlatList;
                case 'ScrollView':
                    return ScrollView;
                case 'SectionList':
                    return SectionList;
                default:
                    throw new Error('Component type not supported: it should be one of `FlatList`, `ScrollView` or `SectionList`');
            }
        };
        this.snapTo = (index) => {
            const snapPoints = this.getNormalisedSnapPoints();
            this.isManuallySetValue.setValue(1);
            this.manualYOffset.setValue(snapPoints[index]);
            this.nextSnapIndex.setValue(index);
        };
        this.lockToOffset = offset => {
            this.isLockYOffset.setValue(1);
            this.lockYOffset.setValue(offset);
            this.prevTranslateYOffset.setValue(offset);
        };
        this.releaseLock = () => {
            this.isLockYOffset.setValue(0);
        };
        const { initialSnapIndex, animationConfig } = props;
        const animationDuration = animationConfig?.duration || DEFAULT_ANIMATION_DURATION;
        const ScrollComponent = this.getScrollComponent();
        // @ts-ignore
        this.scrollComponent = Animated.createAnimatedComponent(ScrollComponent);
        const snapPoints = this.getNormalisedSnapPoints();
        const openPosition = snapPoints[0];
        const closedPosition = snapPoints[snapPoints.length - 1];
        const initialSnap = snapPoints[initialSnapIndex];
        this.nextSnapIndex = new Value(initialSnapIndex);
        const initialDecelerationRate = Platform.select({
            android: props.initialSnapIndex === 0 ? ANDROID_NORMAL_DECELERATION_RATE : 0,
            ios: IOS_NORMAL_DECELERATION_RATE,
        });
        this.decelerationRate = new Value(initialDecelerationRate);
        const handleGestureState = new Value(-1);
        const handleOldGestureState = new Value(-1);
        const drawerGestureState = new Value(-1);
        const drawerOldGestureState = new Value(-1);
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
        const isAnimationInterrupted = and(or(eq(handleGestureState, GestureState.BEGAN), eq(drawerGestureState, GestureState.BEGAN)), clockRunning(this.animationClock));
        this.didGestureFinish = or(and(eq(handleOldGestureState, GestureState.ACTIVE), eq(handleGestureState, GestureState.END)), and(eq(drawerOldGestureState, GestureState.ACTIVE), eq(drawerGestureState, GestureState.END)));
        // Function that determines if the last snap point is in the range {snapPoints}
        // In the case of interruptions in the middle of an animation, we'll get
        // lastSnap values outside the range
        const isLastSnapPointInRange = (i = 0) => i === snapPoints.length
            ? lastSnapInRange
            : cond(eq(this.lastSnap, snapPoints[i]), [set(lastSnapInRange, 1)], isLastSnapPointInRange(i + 1));
        const scrollY = [
            set(lastSnapInRange, 0),
            isLastSnapPointInRange(),
            cond(or(didHandleGestureBegin, and(this.isManuallySetValue, not(eq(this.manualYOffset, snapPoints[0])))), [set(this.dragWithHandle, 1), 0]),
            cond(
            // This is to account for a continuous scroll on the drawer from a snap point
            // Different than top, bringing the drawer to the top position, so that if we
            // change scroll direction without releasing the gesture, it doesn't pull down the drawer again
            and(eq(this.dragWithHandle, 1), greaterThan(snapPoints[0], add(this.lastSnap, this.dragY)), and(not(eq(this.lastSnap, snapPoints[0])), lastSnapInRange)), [
                set(this.lastSnap, snapPoints[0]),
                set(this.dragWithHandle, 0),
                this.lastStartScrollY,
            ], cond(eq(this.dragWithHandle, 1), 0, this.lastStartScrollY)),
        ];
        this.didScrollUpAndPullDown = cond(and(greaterOrEq(this.dragY, this.lastStartScrollY), greaterThan(this.lastStartScrollY, 0)), set(this.scrollUpAndPullDown, 1));
        this.setTranslationY = cond(and(not(this.dragWithHandle), not(greaterOrEq(this.dragY, this.lastStartScrollY))), set(this.translationY, sub(this.dragY, this.lastStartScrollY)), set(this.translationY, this.dragY));
        this.extraOffset = cond(eq(this.scrollUpAndPullDown, 1), this.lastStartScrollY, 0);
        const endOffsetY = add(this.lastSnap, this.translationY, multiply(DRAG_TOSS, this.velocityY));
        this.calculateNextSnapPoint = (i = 0) => i === snapPoints.length
            ? this.tempDestSnapPoint
            : cond(greaterThan(abs(sub(this.tempDestSnapPoint, endOffsetY)), abs(sub(add(snapPoints[i], this.extraOffset), endOffsetY))), [
                set(this.tempDestSnapPoint, add(snapPoints[i], this.extraOffset)),
                set(this.nextSnapIndex, i),
                this.calculateNextSnapPoint(i + 1),
            ], this.calculateNextSnapPoint(i + 1));
        const runTiming = ({ clock, from, to, position, finished, frameTime, }) => {
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
                cond(state.finished, [
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
                        set(this.prevTranslateYOffset, sub(this.prevTranslateYOffset, this.lastStartScrollY)),
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
                state.position),
            ];
        };
        const translateYOffset = cond(isAnimationInterrupted, [
            // set(prevTranslateYOffset, animationPosition) should only run if we are
            // interrupting an animation when the drawer is currently in a different
            // position than the top
            cond(or(this.dragWithHandle, greaterOrEq(abs(this.prevDragY), this.lastStartScrollY)), set(this.prevTranslateYOffset, this.animationPosition)),
            set(this.animationFinished, 1),
            set(this.translationY, 0),
            // Resetting appropriate values
            set(drawerOldGestureState, GestureState.END),
            set(handleOldGestureState, GestureState.END),
            // By forcing that frameTime exceeds duration, it has the effect of stopping the animation
            set(this.animationFrameTime, add(animationDuration, 1000)),
            stopClock(this.animationClock),
            this.prevTranslateYOffset,
        ], cond(or(this.didGestureFinish, this.isManuallySetValue, clockRunning(this.animationClock)), [
            runTiming({
                clock: this.animationClock,
                from: cond(this.isManuallySetValue, this.prevTranslateYOffset, add(this.prevTranslateYOffset, this.translationY)),
                to: this.destSnapPoint,
                position: this.animationPosition,
                finished: this.animationFinished,
                frameTime: this.animationFrameTime,
            }),
        ], [
            set(this.animationFrameTime, 0),
            set(this.animationFinished, 0),
            // @ts-ignore
            this.prevTranslateYOffset,
        ]));
        this.translateY = cond(this.isLockYOffset, this.lockYOffset, interpolate(add(translateYOffset, this.dragY, multiply(scrollY, -1)), {
            inputRange: [openPosition, closedPosition],
            outputRange: [openPosition, closedPosition],
            extrapolate: Extrapolate.CLAMP,
        }));
        this.position = interpolate(this.translateY, {
            inputRange: [openPosition, closedPosition],
            outputRange: [1, 0],
            extrapolate: Extrapolate.CLAMP,
        });
    }
    componentDidMount() {
        this.kb_show = Keyboard.addListener('keyboardDidShow', event => {
            if (this.props.keyboardAwared) {
                const offset = this.props.keyboardTopOffset +
                    Platform.select({ ios: 0, android: this.footerHeight });
                const keyboardHeight = event.endCoordinates.height;
                const currentlyFocusedField = TextInput.State.currentlyFocusedField();
                UIManager.measure(currentlyFocusedField, (originX, originY, width, height, pageX, pageY) => {
                    const gap = windowHeight - (pageY + height + offset) - keyboardHeight;
                    const snapPoints = this.getNormalisedSnapPoints();
                    if (gap < 0)
                        this.lockToOffset(snapPoints[this.prevSnapIndex] + gap);
                });
            }
            this.props.onKeyboardShow(this);
        });
        this.kb_hide = Keyboard.addListener('keyboardDidHide', () => {
            if (this.props.keyboardAwared) {
                this.releaseLock();
                this.snapTo(this.prevSnapIndex);
            }
            this.props.onKeyboardHide(this);
        });
    }
    componentWillUnmount() {
        this.kb_show?.remove();
        this.kb_hide?.remove();
    }
    render() {
        const { renderHandle, snapPoints, initialSnapIndex, componentType, onSettle, animatedPosition, containerStyle, ...rest } = this.props;
        const AnimatedScrollableComponent = this.scrollComponent;
        const normalisedSnapPoints = this.getNormalisedSnapPoints();
        const initialSnap = normalisedSnapPoints[initialSnapIndex];
        const Content = (React.createElement(Animated.View, { style: [
                StyleSheet.absoluteFillObject,
                containerStyle,
                // @ts-ignore
                {
                    transform: [{ translateY: this.translateY }],
                    paddingBottom: this.footerHeightAnim,
                },
            ] },
            React.createElement(PanGestureHandler, { ref: this.drawerHandleRef, shouldCancelWhenOutside: false, simultaneousHandlers: this.masterDrawer, onGestureEvent: this.onHandleGestureEvent, onHandlerStateChange: this.onHandleGestureEvent },
                React.createElement(Animated.View, null, renderHandle())),
            React.createElement(PanGestureHandler, { ref: this.drawerContentRef, simultaneousHandlers: [this.scrollComponentRef, this.masterDrawer], shouldCancelWhenOutside: false, onGestureEvent: this.onDrawerGestureEvent, onHandlerStateChange: this.onDrawerGestureEvent },
                React.createElement(Animated.View, { style: styles.container },
                    React.createElement(NativeViewGestureHandler, { ref: this.scrollComponentRef, waitFor: this.masterDrawer, simultaneousHandlers: this.drawerContentRef },
                        React.createElement(AnimatedScrollableComponent, Object.assign({ overScrollMode: "never", bounces: false }, rest, { ref: this.props.innerRef, 
                            // @ts-ignore
                            decelerationRate: this.decelerationRate, onScrollBeginDrag: this.onScrollBeginDrag, scrollEventThrottle: 1, contentContainerStyle: [
                                rest.contentContainerStyle,
                                { paddingBottom: this.getNormalisedSnapPoints()[0] },
                            ] }))))),
            this.props.animatedPosition && (React.createElement(Animated.Code, { exec: onChange(this.position, set(this.props.animatedPosition, this.position)) })),
            React.createElement(Animated.Code, { exec: onChange(this.dragY, cond(not(eq(this.dragY, 0)), set(this.prevDragY, this.dragY))) }),
            React.createElement(Animated.Code, { exec: onChange(this.didGestureFinish, cond(this.didGestureFinish, [
                    this.didScrollUpAndPullDown,
                    this.setTranslationY,
                    set(this.tempDestSnapPoint, add(normalisedSnapPoints[0], this.extraOffset)),
                    set(this.nextSnapIndex, 0),
                    set(this.destSnapPoint, this.calculateNextSnapPoint()),
                    cond(and(greaterThan(this.dragY, this.lastStartScrollY), this.isAndroid, not(this.dragWithHandle)), call([], () => {
                        // This prevents the scroll glide from happening on Android when pulling down with inertia.
                        // It's not perfect, but does the job for now
                        const { method, args } = imperativeScrollOptions[this.props.componentType];
                        if ((this.props.componentType === 'FlatList' &&
                            (this.props?.data?.length || 0) > 0) ||
                            (this.props.componentType === 'SectionList' &&
                                this.props.sections.length > 0) ||
                            this.props.componentType === 'ScrollView') {
                            // @ts-ignore
                            this.props.innerRef.current?.getNode()[method](args);
                        }
                    })),
                    set(this.dragY, 0),
                    set(this.velocityY, 0),
                    set(this.lastSnap, sub(this.destSnapPoint, cond(eq(this.scrollUpAndPullDown, 1), this.lastStartScrollY, 0))),
                    call([this.lastSnap], ([value]) => {
                        // This is the TapGHandler trick
                        // @ts-ignore
                        this.masterDrawer?.current?.setNativeProps({
                            maxDeltaY: value - this.getNormalisedSnapPoints()[0],
                        });
                    }),
                    set(this.decelerationRate, cond(eq(this.isAndroid, 1), cond(eq(this.lastSnap, normalisedSnapPoints[0]), ANDROID_NORMAL_DECELERATION_RATE, 0), IOS_NORMAL_DECELERATION_RATE)),
                ])) }),
            React.createElement(Animated.Code, { exec: onChange(this.isManuallySetValue, [
                    cond(this.isManuallySetValue, [
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
                    ], [set(this.nextSnapIndex, 0)]),
                ]) })));
        let WrappedContent;
        // On Android, having an intermediary view with pointerEvents="box-none", breaks the
        // waitFor logic
        if (Platform.OS === 'android')
            WrappedContent = (React.createElement(TapGestureHandler, { maxDurationMs: 100000, ref: this.masterDrawer, maxDeltaY: initialSnap - this.getNormalisedSnapPoints()[0], shouldCancelWhenOutside: false }, Content));
        // On iOS, We need to wrap the content on a view with PointerEvents box-none
        // So that we can start scrolling automatically when reaching the top without
        // Stopping the gesture
        else
            WrappedContent = (React.createElement(TapGestureHandler, { maxDurationMs: 100000, ref: this.masterDrawer, maxDeltaY: initialSnap - this.getNormalisedSnapPoints()[0] },
                React.createElement(View, { style: StyleSheet.absoluteFillObject, pointerEvents: "box-none" }, Content)));
        return (React.createElement(React.Fragment, null,
            WrappedContent,
            React.createElement(View, { onLayout: e => {
                    this.footerHeight = e.nativeEvent.layout.height;
                    this.footerHeightAnim.setValue(e.nativeEvent.layout.height);
                }, style: {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                } },
                React.createElement(View, { style: { flex: 1 } }, this.props.renderFooter()))));
    }
}
ScrollBottomSheet.defaultProps = {
    topInset: 0,
    innerRef: React.createRef(),
    keyboardAwared: true,
    keyboardTopOffset: 16,
    renderFooter: () => null,
    onKeyboardShow: () => null,
    onKeyboardHide: () => null,
};
export default ScrollBottomSheet;
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
export const BSTouchableOpacity = props => {
    if (Platform.OS === 'android') {
        return React.createElement(RNGHTouchableOpacity, Object.assign({}, props));
    }
    return React.createElement(TouchableOpacity, Object.assign({}, props));
};
export const BSTouchableHightlight = props => {
    if (Platform.OS === 'android') {
        return React.createElement(RNGHTouchableHighlight, Object.assign({}, props));
    }
    return React.createElement(TouchableHighlight, Object.assign({}, props));
};
export const BSTouchableNativeFeedback = props => {
    if (Platform.OS === 'android') {
        return React.createElement(RNGHTouchableNativeFeedback, Object.assign({}, props));
    }
    return React.createElement(TouchableNativeFeedback, Object.assign({}, props));
};
export const BSTouchableWithoutFeedback = props => {
    if (Platform.OS === 'android') {
        return React.createElement(RNGHTouchableWithoutFeedback, Object.assign({}, props));
    }
    return React.createElement(TouchableWithoutFeedback, Object.assign({}, props));
};
export const BSFlatList = RNGHFlatList;
