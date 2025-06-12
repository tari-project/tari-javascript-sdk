/**
 * @fileoverview Core constants for the Tari JavaScript SDK
 * 
 * Contains numerical constants, limits, and configuration values
 * used throughout the SDK for validation and operation limits.
 */

// Tari amount constants (all values in MicroTari)
export const TARI_PRECISION = 1_000_000n; // 1 Tari = 1,000,000 MicroTari
export const MAX_TARI_SUPPLY = 21_000_000_000_000_000n; // 21 billion Tari in MicroTari
export const MIN_TRANSACTION_AMOUNT = 1n; // Minimum 1 MicroTari
export const DUST_THRESHOLD = 100n; // 100 MicroTari dust threshold

// Transaction limits
export const MAX_TRANSACTION_INPUTS = 1000;
export const MAX_TRANSACTION_OUTPUTS = 1000;
export const MAX_TRANSACTION_MESSAGE_LENGTH = 512;
export const DEFAULT_FEE_PER_GRAM = 25n; // MicroTari per gram
export const MIN_FEE_PER_GRAM = 1n;
export const MAX_FEE_PER_GRAM = 10_000n;

// Address validation constants
export const EMOJI_ADDRESS_LENGTH = 33; // Standard emoji address length
export const BASE58_ADDRESS_MIN_LENGTH = 32;
export const BASE58_ADDRESS_MAX_LENGTH = 64;
export const HEX_ADDRESS_LENGTH = 64; // Standard hex public key length

// Network configuration
export const DEFAULT_MAINNET_PORTS = {
  BASE_NODE: 18142,
  WALLET: 18143,
  STRATUM: 18144
} as const;

export const DEFAULT_TESTNET_PORTS = {
  BASE_NODE: 18152,
  WALLET: 18153,
  STRATUM: 18154
} as const;

export const DEFAULT_NEXTNET_PORTS = {
  BASE_NODE: 18162,
  WALLET: 18163,
  STRATUM: 18164
} as const;

// Timeout constants (in milliseconds)
export const DEFAULT_TIMEOUT = 30_000; // 30 seconds
export const SYNC_TIMEOUT = 300_000; // 5 minutes
export const TRANSACTION_TIMEOUT = 600_000; // 10 minutes
export const CONNECTION_TIMEOUT = 10_000; // 10 seconds

// Retry configuration
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY = 1000; // 1 second
export const RETRY_MAX_DELAY = 30_000; // 30 seconds
export const RETRY_JITTER_FACTOR = 0.1;

// Validation limits
export const MAX_CONTACT_ALIAS_LENGTH = 64;
export const MIN_CONTACT_ALIAS_LENGTH = 1;
export const MAX_WALLET_NAME_LENGTH = 32;
export const MIN_WALLET_NAME_LENGTH = 1;

// File and storage limits
export const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_LOG_FILE_COUNT = 5;
export const MAX_DATABASE_SIZE = 1024 * 1024 * 1024; // 1GB

// Security constants
export const MIN_PASSPHRASE_LENGTH = 8;
export const MAX_PASSPHRASE_LENGTH = 256;
export const PBKDF2_ITERATIONS = 100_000;
export const SALT_LENGTH = 32;

// Event system constants
export const MAX_EVENT_LISTENERS = 100;
export const EVENT_QUEUE_SIZE = 1000;

// FFI resource limits
export const MAX_CONCURRENT_HANDLES = 1000;
export const HANDLE_CLEANUP_INTERVAL = 60_000; // 1 minute
export const MEMORY_PRESSURE_THRESHOLD = 0.8; // 80% of heap

// Mnemonic constants
export const MNEMONIC_ENTROPY_BITS = {
  [12]: 128,
  [15]: 160,
  [18]: 192,
  [21]: 224,
  [24]: 256
} as const;

export const STANDARD_DERIVATION_PATH = "m/44'/535348'/0'/0/0";

// Base58 character set (Bitcoin/Tari compatible)
export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Emoji ID character set (subset of Unicode emojis used by Tari)
export const EMOJI_SET = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
  '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
  '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞',
  '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
  '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
  '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂',
  '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋',
  '🩸', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩',
  '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏',
  '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸',
  '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶',
  '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '💆',
  '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖',
  '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏄', '🚣', '🏊', '⛹️',
  '🏋️', '🚴', '🚵', '🤸', '🤼', '🤽', '🤾', '🤹', '🧘', '🛀',
  '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '🗣️', '👤', '👥',
  '🫂', '👣', '🦰', '🦱', '🦳', '🦲', '🐵', '🐒', '🦍', '🦧',
  '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁',
  '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🦬', '🐮',
  '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐',
  '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐭', '🐁',
  '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🦇', '🐻', '🐨',
  '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓',
  '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉',
  '🦤', '🪶', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍',
  '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭', '🐟', '🐠',
  '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲',
  '🐞', '🦗', '🕷️', '🕸️', '🦂', '🦟', '🪰', '🪱', '🦠', '💐',
  '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱',
  '🪴', '🌲', '🌳', '🌴', '🌵', '🌶️', '🍄', '🌾', '💝', '🎁',
  '🎀', '🎗️', '🎟️', '🎫', '🎖️', '🏆', '🏅', '🥇', '🥈', '🥉',
  '⚽', '⚾', '🥎', '🏀', '🏐', '🏈', '🏉', '🎾', '🥏', '🎳',
  '🏏', '🏑', '🏒', '🥍', '🏓', '🏸', '🥊', '🥋', '🥅', '⛳',
  '⛸️', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🪀', '🪁',
  '🎱', '🎰', '🎲', '🧩', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨',
  '🧵', '🪢', '🧶', '🪡', '🪖', '🪗', '🪘', '🪙', '🪃', '🪅',
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
  '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼',
  '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🛩️', '✈️', '🛫',
  '🛬', '🪂', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽',
  '🚧', '🚨', '🚥', '🚦', '🛑', '🚏', '🗺️', '🗿', '🗽', '🗼',
  '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️',
  '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🏠', '🏡', '🏘️',
  '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨',
  '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋',
  '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇',
  '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁', '⭐', '🌟',
  '💫', '✨', '☄️', '🪐', '🌍', '🌎', '🌏', '🌕', '🌖', '🌗',
  '🌘', '🌑', '🌒', '🌓', '🌔', '🌚', '🌝', '🌛', '🌜', '☀️',
  '🌞', '⭐', '🌟', '💫', '✨', '☄️', '☁️', '⛅', '⛈️', '🌤️',
  '🌦️', '🌧️', '⛆', '🌩️', '❄️', '☃️', '⛄', '🌨️', '💨', '🌪️',
  '🌈', '☔', '💧', '💦', '🌊', '🍇', '🍈', '🍉', '🍊', '🍋',
  '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐',
  '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️',
  '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞',
  '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗',
  '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔',
  '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', '🍿',
  '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝',
  '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡',
  '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧',
  '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🫖', '🍵',
  '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤',
  '🧋', '🧃', '🧉', '🧊'
] as const;

// UTXO constants
export const UTXO_MATURITY_BLOCKS = 6; // Standard confirmation blocks
export const COINBASE_MATURITY_BLOCKS = 1000; // Coinbase maturity

// Version information
export const PROTOCOL_VERSION = 1;
export const API_VERSION = '1.0.0';
export const MIN_SUPPORTED_API_VERSION = '1.0.0';

// Development and testing constants
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
export const IS_TEST = process.env.NODE_ENV === 'test';
export const ENABLE_DEBUG_LOGGING = IS_DEVELOPMENT || process.env.DEBUG === 'true';

// Regular expressions for validation
export const REGEX_PATTERNS = {
  EMOJI_ADDRESS: /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]{33}$/u,
  BASE58_ADDRESS: /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
  HEX_STRING: /^[0-9a-fA-F]+$/,
  WALLET_NAME: /^[a-zA-Z0-9_\-\s]{1,32}$/,
  CONTACT_ALIAS: /^[a-zA-Z0-9_\-\s\.]{1,64}$/
} as const;
