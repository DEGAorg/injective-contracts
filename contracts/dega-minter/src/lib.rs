// Excludes all tests from coverage checks
// See: https://github.com/taiki-e/coverage-helper
#![cfg_attr(all(coverage_nightly, test), feature(coverage_attribute))]

pub mod entry;

mod contract;
mod error;
mod execute;
mod helpers;
mod lookup;
mod query;
mod state;
mod upgrades;

#[cfg(test)]
mod test_helpers;
