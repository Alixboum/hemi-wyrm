// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Hemi Wyrm Arcade
/// @notice On-chain sessions and leaderboard for the Hemi Wyrm game on Hemi Network.
/// A player opens a session with `startSession()` before playing, then closes it with
/// `submitScore()` once the run is over. Best scores per address form the leaderboard.
contract HemiWyrmArcade {
    uint256 public constant MAX_SCORE = 1_000_000;

    struct Player {
        uint64 bestScore;
        uint64 lastScore;
        uint64 bestAt;
        uint32 games;
        bool registered;
        uint256 activeSession;
    }

    mapping(address => Player) public players;
    address[] private playerList;
    uint256 public sessionCount;
    uint256 public totalGames;

    event SessionStarted(address indexed player, uint256 indexed sessionId);
    event ScoreSubmitted(address indexed player, uint256 indexed sessionId, uint256 score, bool newBest);

    error NoActiveSession();
    error ScoreTooHigh();

    /// @notice Opens a new game session for the caller. Any previous unfinished session is replaced.
    function startSession() external returns (uint256 sessionId) {
        Player storage p = players[msg.sender];
        if (!p.registered) {
            p.registered = true;
            playerList.push(msg.sender);
        }
        sessionId = ++sessionCount;
        p.activeSession = sessionId;
        emit SessionStarted(msg.sender, sessionId);
    }

    /// @notice Records the score of the caller's active session and closes it.
    function submitScore(uint256 sessionId, uint256 score) external {
        Player storage p = players[msg.sender];
        if (sessionId == 0 || p.activeSession != sessionId) revert NoActiveSession();
        if (score > MAX_SCORE) revert ScoreTooHigh();
        p.activeSession = 0;
        p.games += 1;
        p.lastScore = uint64(score);
        totalGames += 1;
        bool newBest = score > p.bestScore;
        if (newBest) {
            p.bestScore = uint64(score);
            p.bestAt = uint64(block.timestamp);
        }
        emit ScoreSubmitted(msg.sender, sessionId, score, newBest);
    }

    function playerCount() external view returns (uint256) {
        return playerList.length;
    }

    /// @notice Paginated read of every registered player with their stats.
    function getPlayers(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addrs, uint64[] memory best, uint64[] memory last, uint32[] memory games, uint64[] memory bestAt)
    {
        uint256 total = playerList.length;
        if (offset >= total) {
            return (new address[](0), new uint64[](0), new uint64[](0), new uint32[](0), new uint64[](0));
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        addrs = new address[](n);
        best = new uint64[](n);
        last = new uint64[](n);
        games = new uint32[](n);
        bestAt = new uint64[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = playerList[offset + i];
            Player storage p = players[a];
            addrs[i] = a;
            best[i] = p.bestScore;
            last[i] = p.lastScore;
            games[i] = p.games;
            bestAt[i] = p.bestAt;
        }
    }
}
