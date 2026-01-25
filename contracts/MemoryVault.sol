// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MemoryVault
 * @dev Store and prove ownership of encrypted memories on blockchain
 * @notice This is a minimal contract optimized for gas efficiency
 */
contract MemoryVault {
    // Memory structure
    struct Memory {
        string ipfsHash;      // IPFS CID of encrypted file
        address owner;        // Owner's wallet address
        uint256 timestamp;    // Creation timestamp
        bool exists;          // Check if memory exists
    }

    // State variables
    uint256 private _memoryCounter;
    mapping(uint256 => Memory) private _memories;
    mapping(address => uint256[]) private _userMemories;

    // Events
    event MemoryStored(
        uint256 indexed memoryId,
        address indexed owner,
        string ipfsHash,
        uint256 timestamp
    );

    event MemoryTransferred(
        uint256 indexed memoryId,
        address indexed from,
        address indexed to
    );

    // Modifiers
    modifier onlyOwner(uint256 memoryId) {
        require(_memories[memoryId].exists, "Memory does not exist");
        require(_memories[memoryId].owner == msg.sender, "Not the owner");
        _;
    }

    /**
     * @dev Store a new memory hash
     * @param ipfsHash The IPFS CID of the encrypted memory
     * @return memoryId The ID of the stored memory
     */
    function storeMemory(string memory ipfsHash) external returns (uint256) {
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");

        _memoryCounter++;
        uint256 memoryId = _memoryCounter;

        _memories[memoryId] = Memory({
            ipfsHash: ipfsHash,
            owner: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });

        _userMemories[msg.sender].push(memoryId);

        emit MemoryStored(memoryId, msg.sender, ipfsHash, block.timestamp);

        return memoryId;
    }

    /**
     * @dev Get memory details
     * @param memoryId The ID of the memory
     * @return ipfsHash The IPFS hash
     * @return owner The owner address
     * @return timestamp The creation timestamp
     */
    function getMemory(uint256 memoryId) external view returns (
        string memory ipfsHash,
        address owner,
        uint256 timestamp
    ) {
        require(_memories[memoryId].exists, "Memory does not exist");
        Memory storage mem = _memories[memoryId];
        return (mem.ipfsHash, mem.owner, mem.timestamp);
    }

    /**
     * @dev Get all memory IDs for a user
     * @param user The user's address
     * @return Array of memory IDs
     */
    function getUserMemories(address user) external view returns (uint256[] memory) {
        return _userMemories[user];
    }

    /**
     * @dev Transfer memory ownership (for inheritance)
     * @param memoryId The ID of the memory
     * @param newOwner The new owner's address
     */
    function transferMemory(uint256 memoryId, address newOwner) external onlyOwner(memoryId) {
        require(newOwner != address(0), "Invalid address");
        require(newOwner != msg.sender, "Cannot transfer to self");

        // Remove from current owner's list
        _removeFromUserMemories(msg.sender, memoryId);

        // Update owner
        _memories[memoryId].owner = newOwner;

        // Add to new owner's list
        _userMemories[newOwner].push(memoryId);

        emit MemoryTransferred(memoryId, msg.sender, newOwner);
    }

    /**
     * @dev Verify if a user owns a memory
     * @param memoryId The memory ID
     * @param user The user address
     * @return bool True if user owns the memory
     */
    function verifyOwnership(uint256 memoryId, address user) external view returns (bool) {
        return _memories[memoryId].exists && _memories[memoryId].owner == user;
    }

    /**
     * @dev Get total number of memories stored
     * @return Total count
     */
    function getTotalMemories() external view returns (uint256) {
        return _memoryCounter;
    }

    /**
     * @dev Get memory count for a user
     * @param user The user's address
     * @return Count of user's memories
     */
    function getUserMemoryCount(address user) external view returns (uint256) {
        return _userMemories[user].length;
    }

    // Internal function to remove memory from user's list
    function _removeFromUserMemories(address user, uint256 memoryId) internal {
        uint256[] storage userMems = _userMemories[user];
        for (uint256 i = 0; i < userMems.length; i++) {
            if (userMems[i] == memoryId) {
                userMems[i] = userMems[userMems.length - 1];
                userMems.pop();
                break;
            }
        }
    }
}