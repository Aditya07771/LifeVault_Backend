/// MemoryVault - Store and prove ownership of memories on Aptos
/// 
/// This module allows users to:
/// - Store IPFS hashes of their encrypted memories
/// - Prove ownership with timestamps
/// - Transfer memories (for inheritance)
module memory_vault::memory_vault {
    use std::string::String;
    use std::signer;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::account;

    /// Error codes
    const E_NOT_OWNER: u64 = 1;
    const E_MEMORY_NOT_FOUND: u64 = 2;
    const E_INVALID_ADDRESS: u64 = 3;
    const E_ALREADY_INITIALIZED: u64 = 4;

    /// Represents a single memory
    struct Memory has store, drop, copy {
        id: u64,
        ipfs_hash: String,
        owner: address,
        timestamp: u64,
    }

    /// Store for all memories - held by module publisher
    struct MemoryStore has key {
        memories: vector,
        total_count: u64,
    }

    /// User's memory IDs - resource stored in user's account
    struct UserMemories has key {
        memory_ids: vector,
    }

    /// Events
    #[event]
    struct MemoryStoredEvent has drop, store {
        memory_id: u64,
        owner: address,
        ipfs_hash: String,
        timestamp: u64,
    }

    #[event]
    struct MemoryTransferredEvent has drop, store {
        memory_id: u64,
        from: address,
        to: address,
    }

    /// Initialize the memory store (called once by module publisher)
    public entry fun initialize(account: &signer) {
        let addr = signer::address_of(account);
        assert!(!exists(addr), E_ALREADY_INITIALIZED);
        
        move_to(account, MemoryStore {
            memories: vector::empty(),
            total_count: 0,
        });
    }

    /// Store a new memory
    public entry fun store_memory(
        account: &signer,
        ipfs_hash: String,
    ) acquires MemoryStore, UserMemories {
        let owner = signer::address_of(account);
        let store = borrow_global_mut(@memory_vault);
        
        let memory_id = store.total_count + 1;
        let current_time = timestamp::now_seconds();
        
        let memory = Memory {
            id: memory_id,
            ipfs_hash,
            owner,
            timestamp: current_time,
        };
        
        vector::push_back(&mut store.memories, memory);
        store.total_count = memory_id;
        
        // Add to user's memory list
        if (!exists(owner)) {
            move_to(account, UserMemories {
                memory_ids: vector::empty(),
            });
        };
        let user_memories = borrow_global_mut(owner);
        vector::push_back(&mut user_memories.memory_ids, memory_id);
        
        // Emit event
        event::emit(MemoryStoredEvent {
            memory_id,
            owner,
            ipfs_hash,
            timestamp: current_time,
        });
    }

    /// Transfer memory to new owner
    public entry fun transfer_memory(
        account: &signer,
        memory_id: u64,
        new_owner: address,
    ) acquires MemoryStore, UserMemories {
        let sender = signer::address_of(account);
        let store = borrow_global_mut(@memory_vault);
        
        // Find and update memory
        let len = vector::length(&store.memories);
        let i = 0;
        while (i < len) {
            let memory = vector::borrow_mut(&mut store.memories, i);
            if (memory.id == memory_id) {
                assert!(memory.owner == sender, E_NOT_OWNER);
                memory.owner = new_owner;
                
                // Emit event
                event::emit(MemoryTransferredEvent {
                    memory_id,
                    from: sender,
                    to: new_owner,
                });
                return
            };
            i = i + 1;
        };
        abort E_MEMORY_NOT_FOUND
    }

    /// View function: Get memory by ID
    #[view]
    public fun get_memory(memory_id: u64): (String, address, u64) acquires MemoryStore {
        let store = borrow_global(@memory_vault);
        let len = vector::length(&store.memories);
        let i = 0;
        while (i < len) {
            let memory = vector::borrow(&store.memories, i);
            if (memory.id == memory_id) {
                return (memory.ipfs_hash, memory.owner, memory.timestamp)
            };
            i = i + 1;
        };
        abort E_MEMORY_NOT_FOUND
    }

    /// View function: Get total memory count
    #[view]
    public fun get_total_memories(): u64 acquires MemoryStore {
        borrow_global(@memory_vault).total_count
    }

    /// View function: Verify ownership
    #[view]
    public fun verify_ownership(memory_id: u64, owner: address): bool acquires MemoryStore {
        let store = borrow_global(@memory_vault);
        let len = vector::length(&store.memories);
        let i = 0;
        while (i < len) {
            let memory = vector::borrow(&store.memories, i);
            if (memory.id == memory_id) {
                return memory.owner == owner
            };
            i = i + 1;
        };
        false
    }

    /// View function: Get user's memory count
    #[view]
    public fun get_user_memory_count(user: address): u64 acquires UserMemories {
        if (!exists(user)) {
            return 0
        };
        vector::length(&borrow_global(user).memory_ids)
    }
}