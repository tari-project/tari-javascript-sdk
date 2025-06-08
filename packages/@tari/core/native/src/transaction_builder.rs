use crate::error::{TariError, TariResult};
use tari_core::transactions::tari_amount::MicroMinotari;


/// Simplified UTXO selection strategy for our SDK
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UtxoSelectionStrategy {
    /// Select UTXOs closest to the target amount
    Closest,
    /// Select largest UTXOs first
    Largest,
    /// Select smallest UTXOs first
    Smallest,
    /// Random selection for privacy
    Random,
}

/// Simplified UTXO selection criteria
#[derive(Debug, Clone)]
pub struct UtxoSelectionCriteria {
    pub strategy: UtxoSelectionStrategy,
}

/// Simplified output features version
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFeaturesVersion {
    V1,
    V2,
}

/// Simplified output features 
#[derive(Debug, Clone)]
pub struct OutputFeatures {
    pub version: OutputFeaturesVersion,
    pub maturity: u64,
    pub metadata: Vec<u8>,
}

/// Builder for UTXO selection criteria
#[derive(Debug, Clone)]
pub struct UtxoSelectionCriteriaBuilder {
    strategy: Option<UtxoSelectionStrategy>,
    filter_mode: Option<String>,
    ordering: Option<String>,
    max_utxos: Option<usize>,
    amount: Option<MicroMinotari>,
}

impl UtxoSelectionCriteriaBuilder {
    /// Create a new UTXO selection criteria builder
    pub fn new() -> Self {
        Self {
            strategy: None,
            filter_mode: None,
            ordering: None,
            max_utxos: None,
            amount: None,
        }
    }
    
    /// Set the UTXO selection strategy
    pub fn with_strategy(mut self, strategy: UtxoSelectionStrategy) -> Self {
        self.strategy = Some(strategy);
        self
    }
    
    /// Set the filter mode for UTXO selection
    pub fn with_filter_mode(mut self, filter_mode: String) -> Self {
        self.filter_mode = Some(filter_mode);
        self
    }
    
    /// Set the ordering for UTXO selection
    pub fn with_ordering(mut self, ordering: String) -> Self {
        self.ordering = Some(ordering);
        self
    }
    
    /// Set the maximum number of UTXOs to select
    pub fn with_max_utxos(mut self, max_utxos: usize) -> Self {
        self.max_utxos = Some(max_utxos);
        self
    }
    
    /// Set the target amount for UTXO selection
    pub fn with_amount(mut self, amount: MicroMinotari) -> Self {
        self.amount = Some(amount);
        self
    }
    
    /// Build the UTXO selection criteria
    pub fn build(self) -> TariResult<UtxoSelectionCriteria> {
        let strategy = self.strategy.unwrap_or(UtxoSelectionStrategy::Closest);
        
        // Create basic criteria with strategy
        let criteria = UtxoSelectionCriteria {
            strategy,
        };
        
        Ok(criteria)
    }
    
    /// Create default criteria for a standard transaction
    pub fn default_for_transaction(amount: MicroMinotari) -> Self {
        Self::new()
            .with_strategy(UtxoSelectionStrategy::Closest)
            .with_amount(amount)
            .with_max_utxos(20) // Reasonable default
    }
    
    /// Create criteria optimized for privacy
    pub fn privacy_optimized(amount: MicroMinotari) -> Self {
        Self::new()
            .with_strategy(UtxoSelectionStrategy::Random)
            .with_amount(amount)
            .with_max_utxos(10) // Fewer UTXOs for privacy
    }
    
    /// Create criteria optimized for speed
    pub fn speed_optimized(amount: MicroMinotari) -> Self {
        Self::new()
            .with_strategy(UtxoSelectionStrategy::Largest)
            .with_amount(amount)
            .with_max_utxos(5) // Fewer UTXOs for faster processing
    }
}

impl Default for UtxoSelectionCriteriaBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for transaction output features
#[derive(Debug, Clone)]
pub struct OutputFeaturesBuilder {
    version: OutputFeaturesVersion,
    maturity: u64,
    metadata: Vec<u8>,
    unique_id: Option<[u8; 32]>,
    parent_public_key: Option<Vec<u8>>,
    asset: Option<Vec<u8>>,
    mint_non_fungible: Option<Vec<u8>>,
    sidechain_checkpoint: Option<Vec<u8>>,
}

impl OutputFeaturesBuilder {
    /// Create a new output features builder
    pub fn new() -> Self {
        Self {
            version: OutputFeaturesVersion::V1,
            maturity: 0,
            metadata: Vec::new(),
            unique_id: None,
            parent_public_key: None,
            asset: None,
            mint_non_fungible: None,
            sidechain_checkpoint: None,
        }
    }
    
    /// Set the output features version
    pub fn with_version(mut self, version: OutputFeaturesVersion) -> Self {
        self.version = version;
        self
    }
    
    /// Set the maturity height for the output
    pub fn with_maturity(mut self, maturity: u64) -> Self {
        self.maturity = maturity;
        self
    }
    
    /// Set metadata for the output
    pub fn with_metadata(mut self, metadata: Vec<u8>) -> Self {
        self.metadata = metadata;
        self
    }
    
    /// Set a unique identifier for the output
    pub fn with_unique_id(mut self, unique_id: [u8; 32]) -> Self {
        self.unique_id = Some(unique_id);
        self
    }
    
    /// Set the parent public key
    pub fn with_parent_public_key(mut self, public_key: Vec<u8>) -> Self {
        self.parent_public_key = Some(public_key);
        self
    }
    
    /// Set asset information
    pub fn with_asset(mut self, asset: Vec<u8>) -> Self {
        self.asset = Some(asset);
        self
    }
    
    /// Build the output features
    pub fn build(self) -> TariResult<OutputFeatures> {
        let features = OutputFeatures {
            version: self.version,
            maturity: self.maturity,
            metadata: self.metadata,
        };
        
        Ok(features)
    }
    
    /// Create default features for a standard transaction
    pub fn default_for_transaction() -> Self {
        Self::new()
            .with_version(OutputFeaturesVersion::V1)
            .with_maturity(0)
    }
    
    /// Create features for a time-locked output
    pub fn time_locked(maturity: u64) -> Self {
        Self::new()
            .with_version(OutputFeaturesVersion::V1)
            .with_maturity(maturity)
    }
}

impl Default for OutputFeaturesBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for payment identifiers
#[derive(Debug, Clone)]
pub struct PaymentIdBuilder {
    raw_id: Option<Vec<u8>>,
    description: Option<String>,
    timestamp: Option<u64>,
}

impl PaymentIdBuilder {
    /// Create a new payment ID builder
    pub fn new() -> Self {
        Self {
            raw_id: None,
            description: None,
            timestamp: None,
        }
    }
    
    /// Set the raw payment ID
    pub fn with_raw_id(mut self, id: Vec<u8>) -> Self {
        self.raw_id = Some(id);
        self
    }
    
    /// Set a description for the payment
    pub fn with_description(mut self, description: String) -> Self {
        self.description = Some(description);
        self
    }
    
    /// Set a timestamp for the payment
    pub fn with_timestamp(mut self, timestamp: u64) -> Self {
        self.timestamp = Some(timestamp);
        self
    }
    
    /// Parse a payment ID from a hex string
    pub fn from_hex(hex_string: &str) -> TariResult<Self> {
        let bytes = hex::decode(hex_string)
            .map_err(|e| TariError::InvalidInput(format!("Invalid hex payment ID: {}", e)))?;
        Ok(Self::new().with_raw_id(bytes))
    }
    
    /// Generate a random payment ID
    pub fn random() -> Self {
        use rand::RngCore;
        let mut rng = rand::thread_rng();
        let mut id = vec![0u8; 32];
        rng.fill_bytes(&mut id);
        Self::new().with_raw_id(id)
    }
    
    /// Build the payment ID
    pub fn build(self) -> TariResult<Vec<u8>> {
        if let Some(id) = self.raw_id {
            Ok(id)
        } else {
            // Generate a default random ID if none provided
            Ok(Self::random().raw_id.unwrap())
        }
    }
    
    /// Create a payment ID with description
    pub fn with_description_only(description: String) -> Self {
        let mut builder = Self::random();
        builder.description = Some(description);
        builder
    }
}

impl Default for PaymentIdBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Transaction parameter configuration
#[derive(Debug, Clone)]
pub struct TransactionParams {
    pub utxo_selection: UtxoSelectionCriteria,
    pub output_features: OutputFeatures,
    pub payment_id: Vec<u8>,
    pub fee_per_gram: MicroMinotari,
    pub lock_height: Option<u64>,
    pub message: Option<String>,
}

/// Advanced transaction parameters for complex operations
#[derive(Debug, Clone)]
pub struct AdvancedTransactionParams {
    pub base_params: TransactionParams,
    pub one_sided: bool,
    pub encrypted_data: Option<Vec<u8>>,
    pub stealth_payment: bool,
    pub custom_covenant: Option<Vec<u8>>,
    pub burn_commitment: Option<Vec<u8>>,
}

/// Builder for coin split transactions
#[derive(Debug, Clone)]
pub struct CoinSplitBuilder {
    amount: MicroMinotari,
    split_count: usize,
    fee_per_gram: MicroMinotari,
    lock_height: Option<u64>,
    message: Option<String>,
    strategy: UtxoSelectionStrategy,
}

impl CoinSplitBuilder {
    /// Create a new coin split builder
    pub fn new(amount: MicroMinotari, split_count: usize) -> Self {
        Self {
            amount,
            split_count,
            fee_per_gram: MicroMinotari::from(100), // Default fee
            lock_height: None,
            message: None,
            strategy: UtxoSelectionStrategy::Closest,
        }
    }
    
    /// Set the fee per gram
    pub fn with_fee_per_gram(mut self, fee_per_gram: MicroMinotari) -> Self {
        self.fee_per_gram = fee_per_gram;
        self
    }
    
    /// Set a lock height for the outputs
    pub fn with_lock_height(mut self, lock_height: u64) -> Self {
        self.lock_height = Some(lock_height);
        self
    }
    
    /// Set a message for the transaction
    pub fn with_message(mut self, message: String) -> Self {
        self.message = Some(message);
        self
    }
    
    /// Set the UTXO selection strategy
    pub fn with_strategy(mut self, strategy: UtxoSelectionStrategy) -> Self {
        self.strategy = strategy;
        self
    }
    
    /// Build coin split parameters
    pub fn build(self) -> TariResult<CoinSplitParams> {
        if self.split_count == 0 {
            return Err(TariError::InvalidInput("Split count cannot be zero".to_string()));
        }
        if self.split_count > 500 {
            return Err(TariError::InvalidInput("Split count cannot exceed 500".to_string()));
        }
        if self.amount == MicroMinotari::from(0) {
            return Err(TariError::InvalidInput("Amount cannot be zero".to_string()));
        }
        
        let amount_per_split = self.amount / self.split_count as u64;
        if amount_per_split == MicroMinotari::from(0) {
            return Err(TariError::InvalidInput("Amount per split would be zero".to_string()));
        }
        
        Ok(CoinSplitParams {
            total_amount: self.amount,
            split_count: self.split_count,
            amount_per_split,
            fee_per_gram: self.fee_per_gram,
            lock_height: self.lock_height,
            message: self.message,
            utxo_selection: UtxoSelectionCriteriaBuilder::new()
                .with_strategy(self.strategy)
                .with_amount(self.amount)
                .build()?,
            output_features: if let Some(height) = self.lock_height {
                OutputFeaturesBuilder::time_locked(height).build()?
            } else {
                OutputFeaturesBuilder::default_for_transaction().build()?
            },
            payment_id: PaymentIdBuilder::with_description_only(
                format!("Coin split: {} into {} UTXOs", self.amount, self.split_count)
            ).build()?,
        })
    }
}

/// Parameters for coin split operations
#[derive(Debug, Clone)]
pub struct CoinSplitParams {
    pub total_amount: MicroMinotari,
    pub split_count: usize,
    pub amount_per_split: MicroMinotari,
    pub fee_per_gram: MicroMinotari,
    pub lock_height: Option<u64>,
    pub message: Option<String>,
    pub utxo_selection: UtxoSelectionCriteria,
    pub output_features: OutputFeatures,
    pub payment_id: Vec<u8>,
}

/// Builder for coin join transactions
#[derive(Debug, Clone)]
pub struct CoinJoinBuilder {
    commitments: Vec<String>,
    fee_per_gram: MicroMinotari,
    message: Option<String>,
    merge_to_single_output: bool,
}

impl CoinJoinBuilder {
    /// Create a new coin join builder
    pub fn new(commitments: Vec<String>) -> Self {
        Self {
            commitments,
            fee_per_gram: MicroMinotari::from(100), // Default fee
            message: None,
            merge_to_single_output: true,
        }
    }
    
    /// Set the fee per gram
    pub fn with_fee_per_gram(mut self, fee_per_gram: MicroMinotari) -> Self {
        self.fee_per_gram = fee_per_gram;
        self
    }
    
    /// Set a message for the transaction
    pub fn with_message(mut self, message: String) -> Self {
        self.message = Some(message);
        self
    }
    
    /// Set whether to merge to a single output
    pub fn merge_to_single_output(mut self, merge: bool) -> Self {
        self.merge_to_single_output = merge;
        self
    }
    
    /// Build coin join parameters
    pub fn build(self) -> TariResult<CoinJoinParams> {
        if self.commitments.is_empty() {
            return Err(TariError::InvalidInput("Commitments cannot be empty".to_string()));
        }
        if self.commitments.len() > 100 {
            return Err(TariError::InvalidInput("Too many commitments to join".to_string()));
        }
        
        // Validate commitment format
        for (i, commitment) in self.commitments.iter().enumerate() {
            if commitment.is_empty() {
                return Err(TariError::InvalidInput(format!("Commitment {} is empty", i)));
            }
            // Basic hex validation
            if !commitment.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(TariError::InvalidInput(format!("Commitment {} is not valid hex", i)));
            }
        }
        
        Ok(CoinJoinParams {
            commitments: self.commitments.clone(),
            commitment_count: self.commitments.len(),
            fee_per_gram: self.fee_per_gram,
            message: self.message,
            merge_to_single_output: self.merge_to_single_output,
            output_features: OutputFeaturesBuilder::default_for_transaction().build()?,
            payment_id: PaymentIdBuilder::with_description_only(
                format!("Coin join: {} UTXOs", self.commitments.len())
            ).build()?,
        })
    }
}

/// Parameters for coin join operations
#[derive(Debug, Clone)]
pub struct CoinJoinParams {
    pub commitments: Vec<String>,
    pub commitment_count: usize,
    pub fee_per_gram: MicroMinotari,
    pub message: Option<String>,
    pub merge_to_single_output: bool,
    pub output_features: OutputFeatures,
    pub payment_id: Vec<u8>,
}

impl TransactionParams {
    /// Create transaction parameters for a standard payment
    pub fn standard_payment(
        amount: MicroMinotari,
        fee_per_gram: MicroMinotari,
    ) -> TariResult<Self> {
        Ok(Self {
            utxo_selection: UtxoSelectionCriteriaBuilder::default_for_transaction(amount).build()?,
            output_features: OutputFeaturesBuilder::default_for_transaction().build()?,
            payment_id: PaymentIdBuilder::random().build()?,
            fee_per_gram,
            lock_height: None,
            message: None,
        })
    }
    
    /// Create transaction parameters for a privacy-focused payment
    pub fn privacy_payment(
        amount: MicroMinotari,
        fee_per_gram: MicroMinotari,
    ) -> TariResult<Self> {
        Ok(Self {
            utxo_selection: UtxoSelectionCriteriaBuilder::privacy_optimized(amount).build()?,
            output_features: OutputFeaturesBuilder::default_for_transaction().build()?,
            payment_id: PaymentIdBuilder::random().build()?,
            fee_per_gram,
            lock_height: None,
            message: None,
        })
    }
    
    /// Create transaction parameters for a time-locked payment
    pub fn time_locked_payment(
        amount: MicroMinotari,
        fee_per_gram: MicroMinotari,
        lock_height: u64,
    ) -> TariResult<Self> {
        Ok(Self {
            utxo_selection: UtxoSelectionCriteriaBuilder::default_for_transaction(amount).build()?,
            output_features: OutputFeaturesBuilder::time_locked(lock_height).build()?,
            payment_id: PaymentIdBuilder::random().build()?,
            fee_per_gram,
            lock_height: Some(lock_height),
            message: None,
        })
    }
}

/// Fee calculation utilities
pub struct FeeCalculator;

impl FeeCalculator {
    /// Calculate the fee for a transaction based on size and fee per gram
    pub fn calculate_fee(
        num_inputs: usize,
        num_outputs: usize,
        fee_per_gram: MicroMinotari,
    ) -> TariResult<MicroMinotari> {
        // Rough estimate of transaction size in bytes
        // This is a simplified calculation
        let estimated_size = 200 + (num_inputs * 150) + (num_outputs * 100);
        let fee = fee_per_gram * estimated_size as u64;
        Ok(fee)
    }
    
    /// Get the current recommended fee per gram from network
    pub async fn get_recommended_fee_per_gram() -> TariResult<MicroMinotari> {
        // TODO: Implement actual network fee estimation
        // For now, return a reasonable default
        Ok(MicroMinotari::from(100))
    }
    
    /// Estimate the total cost of a transaction including fee
    pub fn estimate_total_cost(
        amount: MicroMinotari,
        num_inputs: usize,
        num_outputs: usize,
        fee_per_gram: MicroMinotari,
    ) -> TariResult<MicroMinotari> {
        let fee = Self::calculate_fee(num_inputs, num_outputs, fee_per_gram)?;
        Ok(amount + fee)
    }
}

/// Input selection utilities
pub struct InputSelector;

impl InputSelector {
    /// Select UTXOs using the closest strategy
    pub fn select_closest(
        available_utxos: &[MicroMinotari],
        target_amount: MicroMinotari,
    ) -> Vec<usize> {
        let mut indices: Vec<usize> = (0..available_utxos.len()).collect();
        
        // Sort by how close each UTXO is to the target amount
        indices.sort_by(|&a, &b| {
            let diff_a = if available_utxos[a] >= target_amount {
                available_utxos[a] - target_amount
            } else {
                target_amount - available_utxos[a]
            };
            let diff_b = if available_utxos[b] >= target_amount {
                available_utxos[b] - target_amount
            } else {
                target_amount - available_utxos[b]
            };
            diff_a.cmp(&diff_b)
        });
        
        // Select UTXOs until we have enough
        let mut selected = Vec::new();
        let mut total = MicroMinotari::from(0);
        
        for &idx in &indices {
            selected.push(idx);
            total += available_utxos[idx];
            if total >= target_amount {
                break;
            }
        }
        
        selected
    }
    
    /// Select UTXOs using the largest first strategy
    pub fn select_largest_first(
        available_utxos: &[MicroMinotari],
        target_amount: MicroMinotari,
        max_utxos: usize,
    ) -> Vec<usize> {
        let mut indexed_utxos: Vec<(usize, MicroMinotari)> = available_utxos
            .iter()
            .enumerate()
            .map(|(i, &amount)| (i, amount))
            .collect();
        
        // Sort by amount descending
        indexed_utxos.sort_by(|a, b| b.1.cmp(&a.1));
        
        let mut selected = Vec::new();
        let mut total = MicroMinotari::from(0);
        
        for (idx, amount) in indexed_utxos.into_iter().take(max_utxos) {
            selected.push(idx);
            total += amount;
            if total >= target_amount {
                break;
            }
        }
        
        selected
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_utxo_selection_criteria_builder() {
        let criteria = UtxoSelectionCriteriaBuilder::default_for_transaction(MicroMinotari::from(1000))
            .build()
            .unwrap();
        
        assert_eq!(criteria.strategy, UtxoSelectionStrategy::Closest);
    }
    
    #[test]
    fn test_output_features_builder() {
        let features = OutputFeaturesBuilder::default_for_transaction()
            .with_maturity(100)
            .build()
            .unwrap();
        
        assert_eq!(features.maturity, 100);
        assert_eq!(features.version, OutputFeaturesVersion::V1);
    }
    
    #[test]
    fn test_payment_id_builder() {
        let payment_id = PaymentIdBuilder::random().build().unwrap();
        assert_eq!(payment_id.len(), 32);
        
        let hex_id = PaymentIdBuilder::from_hex("deadbeef")
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(hex_id, vec![0xde, 0xad, 0xbe, 0xef]);
    }
    
    #[test]
    fn test_fee_calculator() {
        let fee = FeeCalculator::calculate_fee(2, 2, MicroMinotari::from(100)).unwrap();
        assert!(fee > MicroMinotari::from(0));
        
        let total_cost = FeeCalculator::estimate_total_cost(
            MicroMinotari::from(1000),
            2,
            2,
            MicroMinotari::from(100),
        ).unwrap();
        assert!(total_cost > MicroMinotari::from(1000));
    }
}
